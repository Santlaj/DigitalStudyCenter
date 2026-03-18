/**
 * teacher/boot.js
 * Auth guard, profile UI, logout for teacher portal.
 */

import { auth } from "../api.js";
import { state, resetAllCache } from "./state.js";
import { $, initials } from "../shared/helpers.js";

export async function boot(onReady) {
  try {
    const data = await auth.checkSession();
    state.currentTeacher = data.user;
    state.teacherProfile = data.user;

    if (state.teacherProfile.role && state.teacherProfile.role !== "teacher") {
      window.location.href = "student-portal.html";
      return;
    }

    applyProfileToUI();
    showApp();
    if (onReady) await onReady();
  } catch (err) {
    console.error("Auth check failed:", err.message);
    window.location.href = "index.html";
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
