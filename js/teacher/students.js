/**
 * teacher/students.js
 * Student list, add modal, fees toggle, activate/deactivate, auto-mark inactive.
 */

import { users, fees } from "../api.js";
import { state } from "./state.js";
import { $, escHtml, formatDate, initials, showToast, setLoading } from "../shared/helpers.js";
import { fetchDashboardStats } from "./dashboard.js";

export async function fetchStudents(query = "") {
  const tbody = $("students-tbody");

  // Cache-first: if no search query and data already loaded, re-render from state
  if (!query && state.studentsLoaded && state.allStudents.length >= 0) {
    renderStudentsTable(tbody, state.allStudents);
    return;
  }

  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;

  try {
    const { students: data } = await users.listStudents(query);
    state.allStudents = data || [];
    if (!query) state.studentsLoaded = true;
    renderStudentsTable(tbody, state.allStudents);
  } catch (err) { tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`; }
}

function renderStudentsTable(tbody, students) {
  $("students-count").textContent = `${students.length} student${students.length !== 1 ? "s" : ""}`;
  if (!students.length) { tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No students found.</td></tr>`; return; }

  tbody.innerHTML = students.map(s => {
    const name = s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || "—";
    const ini = initials(name), lastAct = s.last_activity ? formatDate(s.last_activity) : "Never";
    const isActive = s.is_active !== undefined ? s.is_active : (s.last_activity && (new Date() - new Date(s.last_activity)) < 7 * 86400000);
    const feesPaid = s.fees_status === "paid", feesLabel = feesPaid ? "Paid" : (s.fees_status || "Unpaid");
    const feesCls = feesPaid ? "pill-green" : "pill-amber", feesAction = feesPaid ? "unpaid" : "paid";

    return `
      <tr class="${!isActive ? 'student-row-inactive' : ''}">
        <td><div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-weight:700;font-size:0.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0">${escHtml(ini)}</div>
          <span>${escHtml(name)}</span></div></td>
        <td>${escHtml(s.email)}</td><td>${escHtml(s.course || "—")}</td><td>${lastAct}</td>
        <td><span class="pill ${feesCls}">${escHtml(feesLabel)}</span></td>
        <td><span class="pill ${isActive ? "pill-green" : "pill-red"}">${isActive ? "Active" : "Inactive"}</span></td>
        <td style="white-space:nowrap">
          <button class="btn-icon fees-toggle-btn" data-student-id="${escHtml(s.id)}" data-student-name="${escHtml(name)}" data-fees-action="${feesAction}">
            ${feesPaid ? "💸 Mark Unpaid" : "✅ Mark Paid"}</button>
          <button class="btn-icon ${isActive ? "deactivate-btn" : "activate-btn"}" data-student-id="${escHtml(s.id)}" data-student-name="${escHtml(name)}" data-is-active="${isActive}">
            ${isActive ? "🚫 Deactivate" : "✅ Activate"}</button>
        </td></tr>`;
  }).join("");

  tbody.querySelectorAll(".fees-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => updateFeesStatus(btn.dataset.studentId, btn.dataset.studentName, btn.dataset.feesAction));
  });
  tbody.querySelectorAll(".deactivate-btn, .activate-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newActive = btn.dataset.isActive === "false";
      try {
        await users.updateStudentStatus(btn.dataset.studentId, newActive);
        showToast(`${btn.dataset.studentName} ${newActive ? "activated" : "deactivated"}.`, "success");
        state.studentsLoaded = false; state.dashboardLoaded = false;
        await fetchStudents($("students-search").value);
      }
      catch (err) { showToast("Update failed: " + err.message, "error"); }
    });
  });
}

async function updateFeesStatus(studentId, studentName, newStatus) {
  try {
    await fees.markFee(studentId, newStatus);
    showToast(newStatus === "paid" ? `✅ ${studentName} marked as Fees Paid` : `⚠️ ${studentName} marked as Fees Unpaid`, newStatus === "paid" ? "success" : "info");
    state.studentsLoaded = false; state.dashboardLoaded = false;
    await fetchStudents($("students-search").value);
  } catch (err) { showToast("Failed to update fees: " + err.message, "error"); }
}

// ── Add Student Modal ──
export function openAddStudentModal() {
  ["add-student-name-err","add-student-email-err","add-student-pass-err","add-student-general-err"].forEach(id => { const el = $(id); if (el) el.textContent = ""; });
  ["add-student-firstname","add-student-lastname","add-student-email","add-student-course","add-student-password"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  $("add-student-modal").classList.add("open");
}

export function closeAddStudentModal() { $("add-student-modal").classList.remove("open"); }

export async function addStudent() {
  ["add-student-name-err","add-student-email-err","add-student-pass-err","add-student-general-err"].forEach(id => { const el = $(id); if (el) el.textContent = ""; });

  const firstName = $("add-student-firstname").value.trim(), lastName = $("add-student-lastname").value.trim();
  const email = $("add-student-email").value.trim(), course = $("add-student-course").value.trim(), password = $("add-student-password").value;

  let valid = true;
  if (!firstName || !lastName) { $("add-student-name-err").textContent = "First and last name are required."; valid = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("add-student-email-err").textContent = "Valid email is required."; valid = false; }
  if (!password || password.length < 8) { $("add-student-pass-err").textContent = "Password must be at least 8 characters."; valid = false; }
  if (!valid) return;

  const btn = $("add-student-btn");
  setLoading(btn, true, "Add Student");
  try {
    await users.addStudent({ email, password, first_name: firstName, last_name: lastName, course: course || undefined });
    showToast(`Student ${firstName} ${lastName} added!`, "success");
    closeAddStudentModal();
    state.studentsLoaded = false; state.dashboardLoaded = false;
    await fetchStudents($("students-search").value);
    await fetchDashboardStats();
  } catch (err) { $("add-student-general-err").textContent = err.message || "Failed to add student."; }
  finally { setLoading(btn, false, "Add Student"); }
}

export async function autoMarkInactiveUnpaid() {
  if (new Date().getDate() <= 5) { showToast("Auto-mark inactive runs after the 5th of each month.", "info"); return; }
  const btn = $("btn-auto-mark-inactive");
  setLoading(btn, true, "⚡ Auto-Mark Inactive");
  try {
    const { message, updated } = await users.autoMarkInactive();
    showToast(message || `${updated} student(s) marked inactive.`, "success");
    state.studentsLoaded = false; state.dashboardLoaded = false;
    await fetchStudents($("students-search").value);
  } catch (err) { showToast("Error: " + err.message, "error"); }
  finally { setLoading(btn, false, "⚡ Auto-Mark Inactive"); }
}
