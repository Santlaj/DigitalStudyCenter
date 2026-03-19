/**
 * teacher/assignments.js
 * Create form, assignments table, and delete for teacher portal.
 * Uses cache-first: re-renders from state.allAssignments if already loaded.
 */

import { assignments } from "../api.js";
import { state } from "./state.js";
import { $, escHtml, formatDeadline, deadlinePill, showToast, setLoading } from "../shared/helpers.js";
import { fetchDashboardStats } from "./dashboard.js";

export async function createAssignment() {
  ["assign-title-err","assign-subject-err","assign-deadline-err","assign-general-err"]
    .forEach(id => { $(id).textContent = ""; });

  const title = $("assign-title").value.trim(), subject = $("assign-subject").value.trim();
  const description = $("assign-description").value.trim(), deadline = $("assign-deadline").value;

  let valid = true;
  if (!title)    { $("assign-title-err").textContent    = "Title is required.";    valid = false; }
  if (!subject)  { $("assign-subject-err").textContent  = "Subject is required.";  valid = false; }
  if (!deadline) { $("assign-deadline-err").textContent = "Deadline is required."; valid = false; }
  if (!valid) return;

  const btn = $("create-assignment-btn");
  setLoading(btn, true, "Create Assignment");

  try {
    await assignments.create(title, subject, description, new Date(deadline).toISOString());
    showToast("Assignment created!", "success");
    ["assign-title","assign-subject","assign-description","assign-deadline"].forEach(id => { $(id).value = ""; });
    state.assignmentsLoaded = false;
    state.dashboardLoaded = false;
    await loadAssignmentsTable();
    await fetchDashboardStats();
  } catch (err) {
    $("assign-general-err").textContent = err.message || "Failed to create assignment.";
  } finally { setLoading(btn, false, "Create Assignment"); }
}

export async function loadAssignmentsTable() {
  const tbody = $("assignments-tbody");

  // Cache-first: skip API call if already loaded
  if (state.assignmentsLoaded && state.allAssignments.length >= 0) {
    renderAssignmentsTable(tbody, state.allAssignments);
    return;
  }

  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Loading…</td></tr>`;

  try {
    const { assignments: data } = await assignments.teacherAssignments();
    state.allAssignments = data || [];
    state.assignmentsLoaded = true;
    renderAssignmentsTable(tbody, state.allAssignments);
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`; }
}

function renderAssignmentsTable(tbody, data) {
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No assignments yet. Create your first one!</td></tr>`; return; }

  tbody.innerHTML = data.map(a => `
    <tr>
      <td><strong>${escHtml(a.title)}</strong></td>
      <td>${escHtml(a.subject)}</td>
      <td>${formatDeadline(a.deadline)}</td>
      <td>${deadlinePill(a.deadline)}</td>
      <td><button class="btn-icon delete" data-delete-assign="${escHtml(a.id)}" data-name="${escHtml(a.title)}" title="Delete">🗑</button></td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-delete-assign]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window._openDeleteModal) window._openDeleteModal(btn.dataset.name, () => deleteAssignment(btn.dataset.deleteAssign));
    });
  });
}

async function deleteAssignment(id) {
  try {
    await assignments.remove(id);
    showToast("Assignment deleted.", "success");
    state.assignmentsLoaded = false;
    state.dashboardLoaded = false;
    await loadAssignmentsTable();
    await fetchDashboardStats();
  }
  catch (err) { showToast("Delete failed: " + err.message, "error"); }
}
