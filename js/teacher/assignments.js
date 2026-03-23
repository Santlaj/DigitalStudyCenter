/**
 * teacher/assignments.js
 * Create form, assignments table, and delete for teacher portal.
 * Uses cache-first: re-renders from state.allAssignments if already loaded.
 */

import { assignments } from "../api.js";
import { state } from "./state.js";
import { $, escHtml, formatDate, formatDeadline, deadlinePill, showToast, setLoading } from "../shared/helpers.js";
import { fetchDashboardStats } from "./dashboard.js";

export async function createAssignment() {
  ["assign-title-err","assign-subject-err","assign-deadline-err","assign-general-err"]
    .forEach(id => { $(id).textContent = ""; });

  const title = $("assign-title").value.trim(), subject = $("assign-subject").value.trim();
  const description = $("assign-description").value.trim(), deadline = $("assign-deadline").value;
  const course = $("assign-course").value;

  let valid = true;
  if (!title)    { $("assign-title-err").textContent    = "Title is required.";    valid = false; }
  if (!subject)  { $("assign-subject-err").textContent  = "Subject is required.";  valid = false; }
  if (!deadline) { $("assign-deadline-err").textContent = "Deadline is required."; valid = false; }
  if (!valid) return;

  const btn = $("create-assignment-btn");
  setLoading(btn, true, "Create Assignment");

  try {
    await assignments.create(title, subject, description, new Date(deadline).toISOString(), course);
    showToast("Assignment created!", "success");
    ["assign-title","assign-subject","assign-description","assign-deadline"].forEach(id => { $(id).value = ""; });
    $("assign-course").value = "all";
    state.assignmentsLoaded = false;
    state.dashboardLoaded = false;
    await loadAssignmentsTable();
    await fetchDashboardStats();
  } catch (err) {
    $("assign-general-err").textContent = err.message || "Failed to create assignment.";
  } finally { setLoading(btn, false, "Create Assignment"); }
}

export async function loadAssignmentsTable(append = false) {
  const tbody = $("assignments-tbody");
  const loadMoreBtn = $("assignments-load-more");

  if (!append) {
    state.assignmentsOffset = 0;
    state.allAssignments = [];
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Loading…</td></tr>`;
  }

  // Cache-first optimization
  if (!append && state.assignmentsLoaded && state.allAssignments.length > 0) {
    renderAssignmentsTable(tbody, state.allAssignments);
    return;
  }

  try {
    const limit = 20;
    const { assignments: data, count } = await assignments.teacherAssignments(limit, state.assignmentsOffset);
    
    state.allAssignments = append ? [...state.allAssignments, ...data] : data;
    state.assignmentsOffset += limit;
    state.assignmentsLoaded = true;

    renderAssignmentsTable(tbody, state.allAssignments);
    populateSubmissionsDropdown(state.allAssignments);

    if (loadMoreBtn) {
      if (state.allAssignments.length < count) {
        loadMoreBtn.classList.remove("hidden");
        loadMoreBtn.onclick = () => loadAssignmentsTable(true);
      } else {
        loadMoreBtn.classList.add("hidden");
      }
    }
  } catch (err) { 
    if (!append) tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
    else showToast("Failed to load more: " + err.message, "error");
  }
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

function populateSubmissionsDropdown(data) {
  const select = $("submission-assign-select");
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = '<option value="">— Select an Assignment —</option>' + 
    data.map(a => `<option value="${escHtml(a.id)}">${escHtml(a.title)} (${escHtml(a.course === 'all' ? 'All' : 'Class '+a.course)})</option>`).join("");
    
  if (currentVal && data.some(a => a.id === currentVal)) {
    select.value = currentVal;
  }
}

async function loadSubmissionsForAssignment(assignmentId) {
  const wrap = $("submissions-table-wrap");
  const tbody = $("submissions-tbody");
  
  if (!assignmentId) {
    wrap.classList.add("hidden");
    tbody.innerHTML = "";
    return;
  }
  
  wrap.classList.remove("hidden");
  tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Loading submissions...</td></tr>`;
  
  try {
    const { submissions: data } = await assignments.getSubmissionsForAssignment(assignmentId);
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="table-empty">No submissions yet for this assignment.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = data.map(s => {
      const name = s.users?.full_name || `${s.users?.first_name || ""} ${s.users?.last_name || ""}`.trim() || "Unknown";
      const course = s.users?.course || "—";
      return `
        <tr>
          <td><strong>${escHtml(name)}</strong></td>
          <td>${escHtml(course)}</td>
          <td>${formatDate(s.submitted_at)}</td>
          <td>
            <a href="${escHtml(s.file_url)}" target="_blank" class="btn-ghost btn-sm">View File</a>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const select = $("submission-assign-select");
  if (select) {
    select.addEventListener("change", (e) => loadSubmissionsForAssignment(e.target.value));
  }
});
