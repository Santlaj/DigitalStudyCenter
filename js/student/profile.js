/* student/profile.js — Student profile update logic. */

import { users } from "../api.js";
import { state } from "./state.js";
import { applyProfileToUI } from "./boot.js";
import { $, setLoading, showToast } from "../shared/helpers.js";

export async function saveProfile() {
  $("profile-err").textContent = "";
  $("profile-success").classList.add("hidden");

  const firstName = $("profile-firstname").value.trim();
  const lastName  = $("profile-lastname").value.trim();
  const course    = $("profile-course").value.trim();
  const bio       = $("profile-bio").value.trim();

  const btn = $("profile-save-btn");
  setLoading(btn, true, "Save Changes");

  try {
    await users.updateProfile({ first_name: firstName, last_name: lastName, course, bio });
    Object.assign(state.studentProfile, {
      first_name: firstName, last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(), course, bio,
    });
    applyProfileToUI();
    $("profile-success").textContent = "Profile updated successfully!";
    $("profile-success").classList.remove("hidden");
    showToast("Profile saved!", "success");
  } catch (err) {
    $("profile-err").textContent = err.message || "Failed to save profile.";
  } finally {
    setLoading(btn, false, "Save Changes");
  }
}
