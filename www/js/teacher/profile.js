/**
 * teacher/profile.js
 * Profile save for teacher portal.
 */

import { users } from "../api.js";
import { state } from "./state.js";
import { applyProfileToUI } from "./boot.js";
import { $, setLoading, showToast } from "../shared/helpers.js";

export async function saveProfile() {
  $("profile-err").textContent = "";
  $("profile-success").classList.add("hidden");

  const firstName = $("profile-firstname").value.trim();
  const lastName  = $("profile-lastname").value.trim();
  const subject   = $("profile-subject").value.trim();
  const bio       = $("profile-bio").value.trim();

  const btn = $("profile-save-btn");
  setLoading(btn, true, "Save Changes");

  try {
    await users.updateProfile({ first_name: firstName, last_name: lastName, subject, bio });
    Object.assign(state.teacherProfile, {
      first_name: firstName, last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(), subject, bio,
    });
    applyProfileToUI();
    $("profile-success").textContent = "Profile updated successfully!";
    $("profile-success").classList.remove("hidden");
    showToast("Profile saved!", "success");
  } catch (err) {
    $("profile-err").textContent = err.message || "Failed to save profile.";
  } finally { setLoading(btn, false, "Save Changes"); }
}
