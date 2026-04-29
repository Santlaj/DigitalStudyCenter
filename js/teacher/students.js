/* teacher/students.js — Student list management, add modal, and analytics. */

import { users, fees } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDate, initials, showToast, setLoading } from "../shared/helpers.js";
import { fetchDashboardStats } from "./dashboard.js";
import { tableSkeleton, detailSkeleton } from "../shared/skeleton.js";

let currentStudentSearchId = 0;

export async function fetchStudents(query = "", append = false) {
  const searchId = ++currentStudentSearchId;
  const tbody = $("students-tbody");
  const loadMoreBtn = $("students-load-more");

  // Cache-first: if no search query and not paginating, reuse existing data
  if (!query && !append && state.studentsLoaded && state.allStudents.length > 0) {
    renderStudentsTable(tbody, state.allStudents);
    return;
  }

  if (!append) {
    state.studentsOffset = 0;
    state.allStudents = [];
    tbody.innerHTML = tableSkeleton(6, 6);
  }

  try {
    const limit = 20;
    const { students, count } = await users.listStudents(query, limit, state.studentsOffset);

    // Ignore stale search responses to prevent race conditions
    if (searchId !== currentStudentSearchId) return;

    state.allStudents = append ? [...state.allStudents, ...students] : students;
    state.studentsOffset += limit;

    if (!query && !append) state.studentsLoaded = true;
    else if (query) state.studentsLoaded = false; // Invalidate cache when searching

    renderStudentsTable(tbody, state.allStudents);

    // Show/hide Load More
    if (loadMoreBtn) {
      if (state.allStudents.length < count) {
        loadMoreBtn.classList.remove("hidden");
        loadMoreBtn.onclick = () => fetchStudents(query, true);
      } else {
        loadMoreBtn.classList.add("hidden");
      }
    }

  } catch (err) {
    if (searchId !== currentStudentSearchId) return;
    if (!append) tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Error: ${escapeHtml(err.message)}</td></tr>`;
    else showToast("Failed to load more: " + err.message, "error");
  }
}

function renderStudentsTable(tbody, students) {
  $("students-count").textContent = `${students.length} student${students.length !== 1 ? "s" : ""}`;
  if (!students.length) { tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No students found.</td></tr>`; return; }

  tbody.innerHTML = students.map(s => {
    const name = s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || "—";
    const ini = initials(name);
    const isActive = s.is_active === true;
    const feesPaid = s.fees_status === "paid", feesLabel = feesPaid ? "Paid" : (s.fees_status || "Unpaid");
    const feesCls = feesPaid ? "pill-green" : "pill-amber";

    return `
      <tr class="${!isActive ? 'student-row-inactive' : ''}">
        <td><div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-weight:700;font-size:0.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0">${escapeHtml(ini)}</div>
          <span>${escapeHtml(name)}</span></div></td>
        <td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.course || "—")}</td>
        <td><span class="pill ${feesCls}">${escapeHtml(feesLabel)}</span></td>
        <td><span class="pill ${isActive ? "pill-green" : "pill-red"}">${isActive ? "Active" : "Inactive"}</span></td>
        <td style="white-space:nowrap">
          <button class="btn-view-impressive view-student-btn" data-student-id="${escapeHtml(s.id)}">View</button>
        </td></tr>`;
  }).join("");

  tbody.querySelectorAll(".view-student-btn").forEach(btn => {
    btn.addEventListener("click", () => openStudentAnalytics(btn.dataset.studentId));
  });
}

async function updateFeesStatus(studentId, studentName, newStatus) {
  try {
    await fees.markFee(studentId, newStatus);
    showToast(newStatus === "paid" ? `✅ ${studentName} marked as Fees Paid` : `⚠️ ${studentName} marked as Fees Unpaid`, newStatus === "paid" ? "success" : "info");

    // Optimistic update: reflect fees change in the list immediately without
    // waiting for a full re-fetch that may return stale data from the DB.
    state.allStudents = state.allStudents.map(s =>
      s.id === studentId ? { ...s, fees_status: newStatus } : s
    );
    renderStudentsTable($("students-tbody"), state.allStudents);

    // Invalidate so the next navigation forces a fresh server fetch.
    state.studentsLoaded = false;
    state.dashboardLoaded = false;
  } catch (err) { showToast("Failed to update fees: " + err.message, "error"); }
}

// Add Student Modal
export function openAddStudentModal() {
  ["add-student-name-err", "add-student-email-err", "add-student-pass-err", "add-student-general-err"].forEach(id => { const el = $(id); if (el) el.textContent = ""; });
  ["add-student-firstname", "add-student-lastname", "add-student-email", "add-student-course", "add-student-password"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  $("add-student-modal").classList.add("open");
}

export function closeAddStudentModal() { $("add-student-modal").classList.remove("open"); }

export async function addStudent() {
  ["add-student-name-err", "add-student-email-err", "add-student-pass-err", "add-student-general-err"].forEach(id => { const el = $(id); if (el) el.textContent = ""; });

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

// Student Analytics Modal
export async function openStudentAnalytics(studentId) {
  const modal = $("student-analytics-modal");
  const content = $("student-analytics-content");
  if (!modal || !content) return;

  modal.classList.add("open");
  content.innerHTML = detailSkeleton();

  try {
    const data = await users.getStudentAnalytics(studentId);
    renderStudentAnalytics(data);
  } catch (err) {
    content.innerHTML = `<div class="empty-state-sm" style="color:var(--text-danger)">Error loading analytics: ${escapeHtml(err.message)}</div>`;
  }
}

function renderStudentAnalytics(data) {
  const content = $("student-analytics-content");
  if (!content) return;

  const { student, attendance, assignments, notes, fees } = data;

  content.innerHTML = `
    <div id="student-analytics-content">
      
      <!-- Student Header -->
      <div class="student-analytics-header">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h2>${escapeHtml(student.name)}</h2>
          <div class="modal-top-actions">
            <button class="btn-ghost btn-sm modal-fees-btn" data-student-id="${escapeHtml(student.id)}" data-student-name="${escapeHtml(student.name)}" data-action="${student.fees_status === 'paid' ? 'unpaid' : 'paid'}">
              ${student.fees_status === 'paid' ? "💸 Mark Unpaid" : "✅ Mark Paid"}
            </button>
            <button class="btn-ghost ${student.is_active ? 'btn-danger' : 'btn-primary'} btn-sm modal-status-btn" data-student-id="${escapeHtml(student.id)}" data-student-name="${escapeHtml(student.name)}" data-is-active="${student.is_active}">
              ${student.is_active ? "🚫 Deactivate" : "✅ Activate"}
            </button>
          </div>
        </div>
        <div class="student-analytics-details-grid" style="margin-top:10px;">
          <div><strong>Email:</strong> ${escapeHtml(student.email)}</div>
          <div><strong>Course/Class:</strong> ${escapeHtml(student.course)}</div>
          <div><strong>Status:</strong> <span class="pill ${student.is_active ? 'pill-green' : 'pill-red'}">${student.is_active ? 'Active' : 'Inactive'}</span></div>
          <div><strong>Fees:</strong> <span class="pill ${student.fees_status === 'paid' ? 'pill-green' : 'pill-amber'}">${escapeHtml(student.fees_status)}</span></div>
          <div><strong>Last Activity:</strong> ${student.last_activity ? formatDate(student.last_activity) : 'Never'}</div>
        </div>
      </div>

      <div class="student-analytics-grid">
        
        <!-- Attendance -->
        <div class="student-analytics-card">
          <h3>Attendance</h3>
          <div class="student-analytics-stat-list">
            <div><strong>Total Sessions:</strong> ${attendance.total}</div>
            <div><strong>Present:</strong> ${attendance.present}</div>
            <div><strong>Absent:</strong> ${attendance.absent}</div>
            <div><strong>Late:</strong> ${attendance.late}</div>
            <div class="student-analytics-stat-highlight">
              Attendance Rate: ${attendance.percentage}%
            </div>
          </div>
        </div>

        <!-- Assignments -->
        <div class="student-analytics-card">
          <h3>Assignments</h3>
          <div class="student-analytics-stat-list">
            <div><strong>Total Assigned:</strong> ${assignments.total}</div>
            <div><strong>Submitted:</strong> ${assignments.submitted}</div>
            <div><strong>Pending:</strong> ${assignments.pending}</div>
            <div class="student-analytics-stat-highlight">
              Submission Rate: ${assignments.submissionRate}%
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="student-analytics-card">
          <h3>Notes Activity</h3>
          <div class="student-analytics-stat-list">
            <div><strong>Total Downloads:</strong> ${notes.totalDownloads}</div>
            ${notes.recentDownloads && notes.recentDownloads.length > 0 ? `
              <div style="margin-top:10px;"><strong>Recent:</strong></div>
              <ul class="student-analytics-ul">
                ${notes.recentDownloads.map(n => `<li>${escapeHtml(n.title)} (${formatDate(n.date)})</li>`).join('')}
              </ul>
            ` : `<div style="margin-top:10px; color:var(--text-secondary);">No recent downloads.</div>`}
          </div>
        </div>

        <!-- Fees -->
        <div class="student-analytics-card">
          <h3>Fee History</h3>
          <div class="student-analytics-stat-list">
            ${fees.history && fees.history.length > 0 ? `
              <table class="student-analytics-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${fees.history.map(f => `
                    <tr>
                      <td>${escapeHtml(f.month)}</td>
                      <td><span style="color:${f.status === 'paid' ? 'var(--accent-green)' : 'var(--accent-amber)'};">${escapeHtml(f.status)}</span></td>
                      <td>₹${f.amount || 0}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div style="color:var(--text-secondary);">No fee history available.</div>`}
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach dynamic button listeners
  content.querySelectorAll(".modal-fees-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateFeesStatus(btn.dataset.studentId, btn.dataset.studentName, btn.dataset.action);
      // Re-fetch the student analytics to reflect changes
      openStudentAnalytics(btn.dataset.studentId);
    });
  });

  content.querySelectorAll(".modal-status-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const isActive = btn.dataset.isActive === "true";
      const isActivateAction = !isActive;
      try {
        await users.updateStudentStatus(btn.dataset.studentId, isActivateAction);
        showToast(`${btn.dataset.studentName} ${isActivateAction ? "activated" : "deactivated"}.`, "success");

        // Optimistic update: patch is_active in the cached list immediately so
        // the background table reflects the change right away, without depending
        // on a DB re-fetch that may return the old profiles.is_active value.
        state.allStudents = state.allStudents.map(s =>
          s.id === btn.dataset.studentId ? { ...s, is_active: isActivateAction } : s
        );
        renderStudentsTable($("students-tbody"), state.allStudents);

        // Invalidate caches so the next full navigation triggers a fresh server fetch.
        state.studentsLoaded = false;
        state.dashboardLoaded = false;

        // Refresh the analytics modal to show the updated student state.
        openStudentAnalytics(btn.dataset.studentId);
      }
      catch (err) { showToast(`Action failed: ` + err.message, "error"); }
    });
  });
}

setTimeout(() => {
  const modal = $("student-analytics-modal");
  const closeBtn1 = $("student-analytics-close");
  const closeBtn2 = $("student-analytics-close-btn");
  if(modal) {
    if(closeBtn1) closeBtn1.addEventListener("click", () => modal.classList.remove("open"));
    if(closeBtn2) closeBtn2.addEventListener("click", () => modal.classList.remove("open"));
  }
}, 100);
