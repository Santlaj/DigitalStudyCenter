/**
 * student/boot.js
 * Auth guard, profile UI, logout.
 */

import { auth, sync } from "../api.js";
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

    await prefetchAll();

    applyProfileToUI();
    showApp();
    if (onReady) await onReady();
    
    // Start background sync
    if (state.syncIntervalId) clearInterval(state.syncIntervalId);
    state.syncIntervalId = setInterval(prefetchAll, 60000);
  } catch (err) {
    console.error("Auth check failed:", err.message);
    window.location.href = getCleanLink("login");
  }
}

export async function prefetchAll() {
  try {
    const data = await sync.getAll();
    if (data.profile) state.studentProfile = data.profile;
    if (data.stats) state.cachedStats = data.stats;
    if (data.notes) state.allNotes = data.notes;
    if (data.recentNotes) state.cachedDashNotes = data.recentNotes;
    if (data.assignments) state.allAssignments = data.assignments;
    if (data.recentAssignments) state.cachedDashAssign = data.recentAssignments;
    if (data.submittedIds) state.submittedIds = new Set(data.submittedIds);
    if (data.attendance) state.cachedAttendance = data.attendance;
    if (data.feeHistory) {
      state.cachedFeeHistory = data.feeHistory;
      state.allFeeRecords = data.feeHistory;
    }
    if (data.feeStatus) state.cachedFee = data.feeStatus;
    if (data.courses) state.cachedCourses = data.courses;
    if (data.announcements) state.cachedAnnouncements = data.announcements;

    // Set all flags to true
    state.dashboardLoaded = true;
    state.notesLoaded = true;
    state.assignmentsLoaded = true;
    state.attendanceLoaded = true;
    state.feesLoaded = true;
    state.coursesLoaded = true;
    state.announcementsLoaded = true;
  } catch (err) {
    console.error("Background sync failed:", err.message);
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
  $("profile-display-name").textContent  = name;
  $("profile-display-email").textContent = p?.email || "";
  $("profile-avatar-big").textContent    = ini;
  $("profile-email").value               = p?.email || "";
  $("profile-firstname").value           = p?.first_name || "";
  $("profile-lastname").value            = p?.last_name  || "";
  $("profile-course").value              = p?.course     || "";
  $("profile-bio").value                 = p?.bio        || "";
}

function showApp() {
  $("auth-guard").classList.add("hidden");
  $("app-shell").classList.add("visible");
}

export function logoutStudent() {
  resetAllCache();
  auth.logout();
}
