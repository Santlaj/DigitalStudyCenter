/**
 * student/boot.js
 * Auth guard, profile UI, logout.
 */

import { auth } from "../api.js";
import { state, resetAllCache } from "./state.js";
import { $, initials } from "../shared/helpers.js";

export async function boot(onReady) {
  try {
    const data = await auth.checkSession();
    state.currentStudent = data.user;
    state.studentProfile = data.user;

    if (state.studentProfile.role && state.studentProfile.role !== "student") {
      window.location.href = "teacher-portal";
      return;
    }

    applyProfileToUI();
    showApp();
    if (onReady) await onReady();
  } catch (err) {
    console.error("Auth check failed:", err.message);
    window.location.href = "./";
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
