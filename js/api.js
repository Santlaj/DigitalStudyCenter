/**
 * js/api.js
 * DigitalStudyCenter — Client API Module
 * Replaces direct Supabase calls with backend API requests.
 */

import { getCleanLink } from "./shared/helpers.js";

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = window.DIGITALSTUDYCENTER_API || (isLocalhost ? "http://localhost:3000/api" : "https://digitalstudycenter.onrender.com/api");


// LOCAL STORAGE HELPERS
function getToken() {
  return localStorage.getItem("dsc_token") || null;
}

function getRefreshToken() {
  return localStorage.getItem("dsc_refresh_token") || null;
}

function setTokens(token, refreshToken) {
  if (token) localStorage.setItem("dsc_token", token);
  if (refreshToken) localStorage.setItem("dsc_refresh_token", refreshToken);
}

function clearTokens() {
  localStorage.removeItem("dsc_token");
  localStorage.removeItem("dsc_refresh_token");
  localStorage.removeItem("dsc_user");
}

function setUser(user) {
  localStorage.setItem("dsc_user", JSON.stringify(user));
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("dsc_user") || "null");
  } catch {
    return null;
  }
}

/**
 * Decode JWT to check expiry
 */// DECODE JWT
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}


// STATS API
const apiStats = {
  authCalls: 0,
  syncCalls: 0,
  lastLog: Date.now(),

  log() {
    const now = Date.now();
    const mins = Math.max(1, (now - this.lastLog) / 60000);

    // Reset counters periodically
    if (mins > 5) {
      this.authCalls = 0;
      this.syncCalls = 0;
      this.lastLog = now;
    }
  }
};

let globalTokenRefreshPromise = null;




// AUTH RATE GUARD
const authRateGuard = {
  callsInLastMinute: 0,
  lastReset: Date.now(),
  THRESHOLD: 5,  // Max 5 session refreshes per minute per tab

  check() {
    const now = Date.now();
    if (now - this.lastReset > 60000) {
      this.callsInLastMinute = 0;
      this.lastReset = now;
    }
    this.callsInLastMinute++;
    return this.callsInLastMinute <= this.THRESHOLD;
  }
};
// API REQUEST WRAPPER
async function apiRequest(method, endpoint, body = null, options = {}) {
  // Rate guard for auth calls only
  if (endpoint.includes("/auth/session") || endpoint.includes("/auth/refresh")) {
    if (!authRateGuard.check()) {
      console.warn("Auth Rate Guard: Throttling redundant session call. Using cache.");
      const cached = getUser();
      if (cached) return { user: cached };
      throw new Error("Too many authentication requests. Please wait a minute.");
    }
  }

  const url = `${API_BASE}${endpoint}`;
  const headers = {};

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchOpts = { method, headers };

  if (body instanceof FormData) {
    // Don't set Content-Type — browser sets it with boundary
    fetchOpts.body = body;
  } else if (body) {
    headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, fetchOpts);

    // Log stats for auth and sync
    if (endpoint.includes("/auth")) apiStats.authCalls++;
    if (endpoint.includes("/sync")) apiStats.syncCalls++;
    apiStats.log();

    if (res.status === 401) {
      if (endpoint === "/auth/login" || endpoint.includes("/login")) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Invalid Email or Password");
      }

      // Try to refresh token
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        // Retry the original request with new token
        headers["Authorization"] = `Bearer ${getToken()}`;
        const retryRes = await fetch(url, { ...fetchOpts, headers });
        if (!retryRes.ok) {
          const errData = await retryRes.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed (${retryRes.status})`);
        }
        return retryRes.json();
      }
      // Refresh failed — redirect to login
      clearTokens();
      window.location.href = getCleanLink("login");
      throw new Error("Session expired. Redirecting to login.");
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed (${res.status})`);
    }

    return res.json();
  } catch (err) {
    if (err.message === "Failed to fetch") {
      throw new Error("Cannot connect to server. Please check if the backend is running.");
    }
    throw err;
  }
}

async function tryRefreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  // Deduplicate: If another request is already refreshing, wait for it
  if (globalTokenRefreshPromise) return globalTokenRefreshPromise;

  globalTokenRefreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      setTokens(data.token, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      globalTokenRefreshPromise = null;
    }
  })();

  return globalTokenRefreshPromise;
}


// AUTH MODULE
const auth = {
  async login(email, password, role) {
    const data = await apiRequest("POST", "/auth/login", { email, password, role });
    setTokens(data.token, data.refreshToken);
    setUser(data.user);
    return data;
  },

  _sessionPromise: null,

  async checkSession() {
    // If a session check is already in progress, return the same promise
    if (this._sessionPromise) return this._sessionPromise;

    this._sessionPromise = (async () => {
      try {
        const cachedUser = getUser();
        const token = getToken();

        if (cachedUser && token) {
          const payload = parseJwt(token);
          const now = Math.floor(Date.now() / 1000);

          // If token is valid for > 5 more minutes, use cache
          if (payload && payload.exp && (payload.exp - now > 300)) {
            return { user: cachedUser };
          }

          // If token is EXPIRED or nearly expired, WE MUST WAIT for refresh
          // Returning stale/expired user info causes subsequent API calls to fail 401 
          // and triggers concurrent refresh attempts which invalidates sessions.
          const refreshed = await this._backgroundRefresh();
          if (refreshed) {
            return { user: getUser() || cachedUser };
          }

          // Fallback to cached user only if refresh is already pending or failed silently
          return { user: cachedUser };
        }

        const data = await apiRequest("GET", "/auth/session");
        this._lastRefresh = Date.now();
        setUser(data.user);
        return data;
      } finally {
        this._sessionPromise = null;
      }
    })();

    return this._sessionPromise;
  },

  _lastRefresh: 0,
  _refreshPromise: null,

  async _backgroundRefresh() {
    const token = getToken();
    if (!token) return;

    const payload = parseJwt(token);
    const now = Math.floor(Date.now() / 1000);

    // Only refresh if token expires in < 10 minutes
    if (payload && payload.exp && (payload.exp - now > 600)) {
      return;
    }

    // De-duplicate: If a refresh is already in progress, wait for it
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = (async () => {
      try {
        const data = await apiRequest("GET", "/auth/session");
        this._lastRefresh = Date.now();
        setUser(data.user);
      } catch (err) {
        console.warn("Background session refresh failed:", err.message);
      } finally {
        this._refreshPromise = null;
      }
    })();

    return this._refreshPromise;
  },

  async forgotPassword(email) {
    return apiRequest("POST", "/auth/forgot-password", { email });
  },

  async verifyOtp(email, otp) {
    const data = await apiRequest("POST", "/auth/verify-otp", { email, otp });
    // Store the recovery token for the password reset step
    if (data.token) setTokens(data.token, null);
    return data;
  },

  async resetPassword(password) {
    return apiRequest("POST", "/auth/reset-password", { password });
  },

  logout() {
    clearTokens();
    window.location.href = "login";
  },
};


// NOTES MODULE
const notes = {
  async list(search = "", limit = 20, offset = 0) {
    const q = new URLSearchParams({ search, limit, offset }).toString();
    return apiRequest("GET", `/notes?${q}`);
  },

  async recent() {
    return apiRequest("GET", "/notes/recent");
  },

  async teacherNotes(search = "", limit = 20, offset = 0) {
    const q = new URLSearchParams({ search, limit, offset }).toString();
    return apiRequest("GET", `/notes/teacher?${q}`);
  },

  async upload(title, subject, course, description, file) {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("subject", subject);
    if (course) formData.append("course", course);
    if (description) formData.append("description", description);
    formData.append("file", file);
    return apiRequest("POST", "/notes", formData);
  },

  async remove(id) {
    return apiRequest("DELETE", `/notes/${id}`);
  },

  async download(id) {
    return apiRequest("POST", `/notes/${id}/download`);
  },
};


// ASSIGNMENTS MODULE
const assignments = {
  async list(search = "", limit = 20, offset = 0) {
    const q = new URLSearchParams({ search, limit, offset }).toString();
    return apiRequest("GET", `/assignments?${q}`);
  },

  async teacherAssignments(limit = 20, offset = 0) {
    const q = new URLSearchParams({ limit, offset }).toString();
    return apiRequest("GET", `/assignments/teacher?${q}`);
  },

  async create(title, subject, description, deadline, course = "all") {
    return apiRequest("POST", "/assignments", { title, subject, description, deadline, course });
  },

  async remove(id) {
    return apiRequest("DELETE", `/assignments/${id}`);
  },

  async getSubmissions() {
    return apiRequest("GET", "/assignments/submissions");
  },

  async getSubmissionsForAssignment(assignmentId) {
    return apiRequest("GET", `/assignments/${assignmentId}/submissions`);
  },

  async submit(assignmentId, file) {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest("POST", `/assignments/${assignmentId}/submit`, formData);
  },
};


// USERS MODULE
const users = {
  async getProfile() {
    return apiRequest("GET", "/users/profile");
  },

  async updateProfile(data) {
    return apiRequest("PATCH", "/users/profile", data);
  },

  async listStudents(search = "", limit = 20, offset = 0) {
    const q = new URLSearchParams({ search, limit, offset }).toString();
    return apiRequest("GET", `/users/students?${q}`);
  },

  async addStudent(data) {
    return apiRequest("POST", "/users/students", data);
  },

  async updateStudentStatus(studentId, isActive) {
    return apiRequest("PATCH", `/users/students/${studentId}/status`, { is_active: isActive });
  },

  async updateStudentFees(studentId, status) {
    return apiRequest("PATCH", `/users/students/${studentId}/fees`, { status });
  },

  async autoMarkInactive() {
    return apiRequest("POST", "/users/students/auto-mark-inactive");
  },

  async getDashboardStats() {
    return apiRequest("GET", "/users/dashboard-stats");
  },
};


// ATTENDANCE MODULE
const attendance = {
  async studentOverview() {
    return apiRequest("GET", "/attendance/student");
  },

  async sessions() {
    return apiRequest("GET", "/attendance/sessions");
  },

  async saveSession(data) {
    return apiRequest("POST", "/attendance/sessions", data);
  },

  async getSessionRecords(sessionId) {
    return apiRequest("GET", `/attendance/sessions/${sessionId}/records`);
  },

  async deleteSession(sessionId) {
    return apiRequest("DELETE", `/attendance/sessions/${sessionId}`);
  },

  async getStudentsForClass(className) {
    const q = className ? `?class=${encodeURIComponent(className)}` : "";
    return apiRequest("GET", `/attendance/students-for-class${q}`);
  },
};


// FEES MODULE
const fees = {
  async current() {
    return apiRequest("GET", "/fees/current");
  },

  async history() {
    return apiRequest("GET", "/fees/history");
  },

  async markFee(studentId, status, amount) {
    return apiRequest("PATCH", `/fees/${studentId}`, { status, amount });
  },
};


// COURSES MODULE
const courses = {
  async list() {
    return apiRequest("GET", "/courses");
  },
};


// ANNOUNCEMENTS MODULE
const announcements = {
  async list() {
    return apiRequest("GET", "/announcements");
  },

  async count() {
    return apiRequest("GET", "/announcements/count");
  },

  async create(data) {
    return apiRequest("POST", "/announcements", data);
  },
};


// ANALYTICS MODULE
const analytics = {
  async teacher() {
    return apiRequest("GET", "/analytics/teacher");
  },

  async student() {
    return apiRequest("GET", "/analytics/student");
  },
};

/*   DASHBOARD API  */
// DASHBOARD MODULE
const dashboard = {
  async getSummary() {
    return apiRequest("GET", "/dashboard/summary");
  }
};

/*   EXPORTS   */
// EXPORTS
export {
  API_BASE,
  getToken,
  getUser,
  setUser,
  clearTokens,
  auth,
  dashboard,
  notes,
  assignments,
  users,
  attendance,
  fees,
  courses,
  announcements,
  analytics
};
