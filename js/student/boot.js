/**
 * student/boot.js
 * Auth guard, profile UI, logout.
 */

import { auth, dashboard } from "../api.js";
import { state, resetAllCache } from "./state.js";
import { $, initials, getCleanLink } from "../shared/helpers.js";

export async function boot(onReady) {
  try {
    const data = await auth.checkSession();
    state.currentStudent = data.user;
    state.studentProfile = data.user;

    if (state.studentProfile.role && state.studentProfile.role !== "student") {
      window.location.href = getCleanLink("teacher-portal");
      return;
    }

    await fetchDashboardSummary();

    applyProfileToUI();
    showApp();
    if (onReady) await onReady();
    
    // Start background sync with Visibility API awareness
    const SYNC_INTERVAL = 1800000; // 30 minutes
    
    const startPolling = () => {
      if (state.syncIntervalId) clearInterval(state.syncIntervalId);
      state.syncIntervalId = setInterval(fetchDashboardSummary, SYNC_INTERVAL);
    };

    const stopPolling = () => {
      if (state.syncIntervalId) clearInterval(state.syncIntervalId);
      state.syncIntervalId = null;
    };

    // Initial start
    startPolling();

    // Visibility Listener
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        fetchDashboardSummary(); // Immediate sync on resume
        startPolling();
      } else {
        stopPolling();
      }
    });
  } catch (err) {
    console.error("Auth check failed:", err.message);

    // If we have a cached token + user, stay logged in (offline/slow network)
    const cachedUser = JSON.parse(localStorage.getItem("dsc_user") || "null");
    const cachedToken = localStorage.getItem("dsc_token");

    if (cachedToken && cachedUser) {
      console.warn("Using cached session — backend unreachable.");
      state.currentStudent = cachedUser;
      state.studentProfile = cachedUser;
      applyProfileToUI();
      showApp();
      if (onReady) await onReady();
      return;
    }

    window.location.href = getCleanLink("login");
  }
}

export async function fetchDashboardSummary() {
  try {
    const data = await dashboard.getSummary();
    if (data.profile) state.studentProfile = data.profile;
    if (data.stats) state.cachedStats = data.stats;
    if (data.recentNotes) state.cachedDashNotes = data.recentNotes;
    if (data.recentAssignments) state.cachedDashAssign = data.recentAssignments;
    if (data.submittedIds) state.submittedIds = new Set(data.submittedIds);
    if (data.attendanceSummary) state.cachedAttendanceSummary = data.attendanceSummary;
    if (data.feeStatus) state.cachedFee = data.feeStatus;

    // Set ONLY dashboard flag to true to allow lazy loading of other sections
    state.dashboardLoaded = true;
  } catch (err) {
    console.error("Dashboard summary fetch failed:", err.message);
  }
}

export function applyProfileToUI() {
  const p    = state.studentProfile;
  const name = p?.full_name
    || `${p?.first_name || ""} ${p?.last_name || ""}`.trim()
    || p?.email || "Student";

  const short = name.split(" ")[0] || "Student";
  const ini   = initials(name);

  $("sb-name").textContent               = name;
  $("sb-avatar").textContent             = ini;
  $("topnav-name").textContent           = short;
  $("topnav-avatar").textContent         = ini;
  $("welcome-name").textContent          = short;
  if ($("popup-name-large")) $("popup-name-large").textContent = name;
  if ($("popup-email")) $("popup-email").textContent = p?.email || "No email";
  if ($("popup-course")) $("popup-course").textContent = p?.course || p?.class || "No Course Linked";
  if ($("popup-avatar-large")) $("popup-avatar-large").textContent = ini;
}

function showApp() {
  $("auth-guard").classList.add("hidden");
  $("app-shell").classList.add("visible");
}

export function logoutStudent() {
  resetAllCache();
  auth.logout();
}
