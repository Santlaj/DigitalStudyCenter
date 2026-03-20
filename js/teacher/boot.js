/**
 * teacher/boot.js
 * Auth guard, profile UI, logout for teacher portal.
 */

import { auth, dashboard } from "../api.js";
import { state, resetAllCache } from "./state.js";
import { $, initials, getCleanLink } from "../shared/helpers.js";

export async function boot(onReady) {
  try {
    const data = await auth.checkSession();
    state.currentTeacher = data.user;
    state.teacherProfile = data.user;

    if (state.teacherProfile.role && state.teacherProfile.role !== "teacher") {
      window.location.href = getCleanLink("student-portal");
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
      state.currentTeacher = cachedUser;
      state.teacherProfile = cachedUser;
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
    if (data.profile) state.teacherProfile = data.profile;
    if (data.stats) state.cachedStats = data.stats;
    if (data.recentNotes) state.cachedRecentNotes = data.recentNotes;
    if (data.recentAssignments) state.cachedRecentAssignments = data.recentAssignments;

    state.dashboardLoaded = true;
  } catch (err) {
    console.error("Dashboard summary fetch failed:", err.message);
  }
}

export function applyProfileToUI() {
  const p    = state.teacherProfile;
  const name = p?.full_name
    || `${p?.first_name || ""} ${p?.last_name || ""}`.trim()
    || p?.email || "Teacher";

  const short = name.split(" ")[0] || "Teacher";
  const ini   = initials(name);

  $("sb-name").textContent              = name;
  $("sb-avatar").textContent            = ini;
  $("topnav-name").textContent          = short;
  $("topnav-avatar").textContent        = ini;
  $("welcome-name").textContent         = short;
  $("profile-display-name").textContent = name;
  $("profile-display-email").textContent = p?.email || "";
  $("profile-avatar-big").textContent   = ini;
  $("profile-email").value              = p?.email || "";
  $("profile-firstname").value          = p?.first_name || "";
  $("profile-lastname").value           = p?.last_name  || "";
  $("profile-subject").value            = p?.subject    || "";
  $("profile-bio").value                = p?.bio        || "";
}

function showApp() {
  $("auth-guard").classList.add("hidden");
  $("app-shell").classList.add("visible");
}

export function logoutTeacher() {
  resetAllCache();
  auth.logout();
}
