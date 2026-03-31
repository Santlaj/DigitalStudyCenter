/**
 * student/assignments.js
 * Assignments listing, submit modal, and file-drop for student portal.
 */

import { assignments } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDeadline, deadlineCountdown, deadlineClass, showToast, setLoading } from "../shared/helpers.js";
import { fetchDashboardStats } from "./dashboard.js";

export async function fetchAssignments(query = "", append = false) {
  const list = $("assignments-list");
  const loadMoreBtn = $("assignments-load-more");

  if (!append) {
    state.assignmentsOffset = 0;
    state.allAssignments = [];
    list.innerHTML = `<div class="empty-state-sm">Loading…</div>`;
  }

  // Cache-first optimization
  if (!query && !append && state.assignmentsLoaded && state.allAssignments.length > 0) {
    renderAssignmentsList(list, state.allAssignments);
    return;
  }

  try {
    const limit = 20;
    const { assignments: data, count } = await assignments.list(query, limit, state.assignmentsOffset);

    if (!state.submittedIds.size) {
      try {
        const { submittedIds: ids } = await assignments.getSubmissions();
        state.submittedIds = new Set(ids);
      } catch (e) { /* ignore */ }
    }

    state.allAssignments = append ? [...state.allAssignments, ...data] : data;
    state.assignmentsOffset += limit;
    
    if (!query && !append) state.assignmentsLoaded = true;

    renderAssignmentsList(list, state.allAssignments);

    if (loadMoreBtn) {
      if (state.allAssignments.length < count) {
        loadMoreBtn.classList.remove("hidden");
        loadMoreBtn.onclick = () => fetchAssignments(query, true);
      } else {
        loadMoreBtn.classList.add("hidden");
      }
    }
  } catch (err) {
    if (!append) list.innerHTML = `<div class="empty-state-sm">Error: ${escapeHtml(err.message)}</div>`;
    else showToast("Failed to load more: " + err.message, "error");
  }
}

function renderAssignmentsList(list, data) {
  $("assignments-count").textContent =
    `${data.length} assignment${data.length !== 1 ? "s" : ""}`;

  if (!data.length) {
    list.innerHTML = `<div class="empty-state-sm">No assignments yet.</div>`;
    return;
  }

  list.innerHTML = data.map(a => {
    const teacher    = a.users?.full_name
      || `${a.users?.first_name || ""} ${a.users?.last_name || ""}`.trim()
      || "Teacher";
    const dClass     = deadlineClass(a.deadline);
    const countdown  = deadlineCountdown(a.deadline);
    const submitted  = state.submittedIds.has(a.id);

    let statusPill = "";
    if (submitted)                   statusPill = `<span class="pill pill-teal">✓ Submitted</span>`;
    else if (dClass === "overdue")   statusPill = `<span class="pill pill-red">Overdue</span>`;
    else if (dClass === "due-soon")  statusPill = `<span class="pill pill-amber">Due today</span>`;
    else                             statusPill = `<span class="pill pill-green">Upcoming</span>`;

    return `
      <div class="assignment-card ${submitted ? "submitted" : dClass}">
        <div class="assign-left">
          <div class="assign-title">${escapeHtml(a.title)} ${statusPill}</div>
          <div class="assign-meta">
            ${escapeHtml(a.subject)} · Uploaded by ${escapeHtml(teacher)} · Due ${formatDeadline(a.deadline)}
          </div>
          ${a.description ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:6px">${escapeHtml(a.description.slice(0, 100))}</div>` : ""}
        </div>
        <div class="assign-right">
          ${countdown ? `<div class="deadline-countdown" style="margin-bottom:8px">${escapeHtml(countdown)}</div>` : ""}
          ${!submitted
            ? `<button class="btn-primary btn-sm btn-submit-trigger" data-id="${escapeHtml(a.id)}" data-title="${escapeHtml(a.title)}">Submit Now</button>`
            : `<button class="btn-ghost btn-sm" disabled>Submitted</button>`}
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".btn-submit-trigger").forEach(btn => {
    btn.addEventListener("click", () => openSubmitModal(btn.dataset.id, btn.dataset.title));
  });
}

export function openSubmitModal(assignmentId, assignmentTitle) {
  state.pendingSubmit = { id: assignmentId, title: assignmentTitle };
  $("submit-assignment-title").textContent = assignmentTitle;
  $("submit-file").value                   = "";
  $("submit-file-selected").textContent    = "";
  $("submit-file-err").textContent         = "";
  $("submit-general-err").textContent      = "";
  $("submit-progress-wrap").classList.add("hidden");
  $("submit-progress-bar").style.width     = "0%";
  $("submit-modal").classList.add("open");
}

export function closeSubmitModal() {
  $("submit-modal").classList.remove("open");
  state.pendingSubmit = null;
}

export async function submitAssignment() {
  $("submit-file-err").textContent    = "";
  $("submit-general-err").textContent = "";
  if (!state.pendingSubmit) return;

  const fileInput = $("submit-file");
  const file      = fileInput.files?.[0];

  if (!file) { $("submit-file-err").textContent = "Please select a file to submit."; return; }
  if (file.size > 1 * 1024 * 1024) { $("submit-file-err").textContent = "File must be under 1 MB."; return; }

  const btn          = $("submit-confirm-btn");
  const progressWrap = $("submit-progress-wrap");
  const progressBar  = $("submit-progress-bar");
  const progressLbl  = $("submit-progress-label");

  setLoading(btn, true, "Submit Assignment");
  progressWrap.classList.remove("hidden");
  progressBar.style.width = "30%";
  progressLbl.textContent = "Uploading file…";

  try {
    await assignments.submit(state.pendingSubmit.id, file);
    progressBar.style.width = "100%";
    progressLbl.textContent = "Submitted!";
    state.submittedIds.add(state.pendingSubmit.id);
    showToast("Assignment submitted successfully!", "success");

    setTimeout(() => {
      closeSubmitModal();
      state.assignmentsLoaded = false;
      state.dashboardLoaded = false;
      fetchAssignments($("assignments-search").value);
      fetchDashboardStats();
    }, 700);
  } catch (err) {
    $("submit-general-err").textContent = err.message || "Submission failed.";
    progressWrap.classList.add("hidden");
  } finally {
    setLoading(btn, false, "Submit Assignment");
    setTimeout(() => { progressWrap.classList.add("hidden"); progressBar.style.width = "0%"; }, 1200);
  }
}

export function initSubmitFileDrop() {
  const zone  = $("submit-drop-zone");
  const input = $("submit-file");
  if (!zone || !input) return;

  zone.addEventListener("dragover",  (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
      $("submit-file-selected").textContent = `📎 ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`;
    }
  });
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) $("submit-file-selected").textContent = `📎 ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`;
  });
}
