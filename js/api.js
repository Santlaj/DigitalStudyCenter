/**
 * js/api.js
 * DigitalStudyCenter — Client API Module
 * Replaces direct Supabase calls with backend API requests.
 */

const API_BASE = window.DIGITALSTUDYCENTER_API || "https://digitalstudycenter.onrender.com/api";

/* ═══════════════════════════════════════════════════════
   TOKEN MANAGEMENT
═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
   CORE REQUEST HELPER
═══════════════════════════════════════════════════════ */

async function apiRequest(method, endpoint, body = null, options = {}) {
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

    if (res.status === 401) {
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
      window.location.href = "./";
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
  }
}

/* ═══════════════════════════════════════════════════════
   AUTH API
═══════════════════════════════════════════════════════ */

const auth = {
  async login(email, password, role) {
    const data = await apiRequest("POST", "/auth/login", { email, password, role });
    setTokens(data.token, data.refreshToken);
    setUser(data.user);
    return data;
  },

  async checkSession() {
    const data = await apiRequest("GET", "/auth/session");
    setUser(data.user);
    return data;
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
    window.location.href = "index.html";
  },
};

/* ═══════════════════════════════════════════════════════
   NOTES API
═══════════════════════════════════════════════════════ */

const notes = {
  async list(search = "") {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiRequest("GET", `/notes${q}`);
  },

  async recent() {
    return apiRequest("GET", "/notes/recent");
  },

  async teacherNotes(search = "") {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiRequest("GET", `/notes/teacher${q}`);
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

/* ═══════════════════════════════════════════════════════
   ASSIGNMENTS API
═══════════════════════════════════════════════════════ */

const assignments = {
  async list(search = "") {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiRequest("GET", `/assignments${q}`);
  },

  async teacherAssignments() {
    return apiRequest("GET", "/assignments/teacher");
  },

  async create(title, subject, description, deadline) {
    return apiRequest("POST", "/assignments", { title, subject, description, deadline });
  },

  async remove(id) {
    return apiRequest("DELETE", `/assignments/${id}`);
  },

  async getSubmissions() {
    return apiRequest("GET", "/assignments/submissions");
  },

  async submit(assignmentId, file) {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest("POST", `/assignments/${assignmentId}/submit`, formData);
  },
};

/* ═══════════════════════════════════════════════════════
   USERS API
═══════════════════════════════════════════════════════ */

const users = {
  async getProfile() {
    return apiRequest("GET", "/users/profile");
  },

  async updateProfile(data) {
    return apiRequest("PATCH", "/users/profile", data);
  },

  async listStudents(search = "") {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiRequest("GET", `/users/students${q}`);
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

  async getSubjects() {
    return apiRequest("GET", "/users/subjects");
  },
};

/* ═══════════════════════════════════════════════════════
   ATTENDANCE API
═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
   FEES API
═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
   COURSES API
═══════════════════════════════════════════════════════ */

const courses = {
  async list() {
    return apiRequest("GET", "/courses");
  },
};

/* ═══════════════════════════════════════════════════════
   ANNOUNCEMENTS API
═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
   ANALYTICS API
═══════════════════════════════════════════════════════ */

const analytics = {
  async teacher() {
    return apiRequest("GET", "/analytics/teacher");
  },

  async student() {
    return apiRequest("GET", "/analytics/student");
  },
};

/* ═══════════════════════════════════════════════════════
   EXPORTS
═══════════════════════════════════════════════════════ */

export {
  API_BASE,
  getToken,
  getUser,
  setUser,
  clearTokens,
  auth,
  notes,
  assignments,
  users,
  attendance,
  fees,
  courses,
  announcements,
  analytics,
};
