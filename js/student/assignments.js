/* student/assignments.js — Assignments, submit modal, and file-drop logic. */

import { assignments } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDate, formatDeadline, deadlineCountdown, deadlineClass, showToast, setLoading } from "../shared/helpers.js";
import { fetchDashboardStats } from "./dashboard.js";
import { cardSkeleton } from "../shared/skeleton.js";

// SVG Icons
const ICON_SUBJECT  = `<svg class="meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
const ICON_TEACHER  = `<svg class="meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const ICON_CALENDAR = `<svg class="meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const ICON_SUBMIT   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><path d="M22 2L11 13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

let currentFilter = "all";

export async function fetchAssignments(query = "", append = false) {
  const list = $("assignments-list");
  const loadMoreBtn = $("assignments-load-more");

  if (!append) {
    state.assignmentsOffset = 0;
    state.allAssignments = [];
    list.innerHTML = cardSkeleton(4);
  }

  // Cache-first optimization
  if (!query && !append && state.assignmentsLoaded && state.allAssignments.length > 0) {
    applyFilters();
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

    applyFilters();

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

function applyFilters() {
  const list = $("assignments-list");
  let data = state.allAssignments;

  if (currentFilter !== "all") {
    data = data.filter(a => {
      const submitted = state.submittedIds.has(a.id);
      const isOverdue = new Date(a.deadline) < new Date() && !submitted;
      
      if (currentFilter === "submitted") return submitted;
      if (currentFilter === "overdue")   return isOverdue;
      if (currentFilter === "pending")   return !submitted && !isOverdue;
      return true;
    });
  }

  renderAssignmentsList(list, data);
}

function renderAssignmentsList(list, data) {
  $("assignments-count").textContent =
    `${data.length} total`;

  if (!data.length) {
    list.innerHTML = `<div class="empty-state-sm">No assignments found for this filter.</div>`;
    return;
  }

  list.innerHTML = data.map(a => {
    const teacher    = a.users?.full_name
      || `${a.users?.first_name || ""} ${a.users?.last_name || ""}`.trim()
      || "Teacher";
    const dClass     = deadlineClass(a.deadline);
    const countdown  = deadlineCountdown(a.deadline);
    const submitted  = state.submittedIds.has(a.id);

    let statusLabel = "";
    let statusClass = "upcoming";

    if (submitted) {
      statusLabel = "Submitted";
      statusClass = "submitted";
    } else if (dClass === "overdue") {
      statusLabel = "Overdue";
      statusClass = "overdue";
    } else if (dClass === "due-soon") {
      statusLabel = "Due Today";
      statusClass = "due-soon";
    } else {
      statusLabel = "Upcoming";
      statusClass = "upcoming";
    }

    return `
      <div class="assignment-card ${statusClass}">
        <div class="assign-left">
          <div class="assign-header">
            <div class="assign-title" title="${escapeHtml(a.title)}">${escapeHtml(a.title)}</div>
            <span class="pill pill-${statusClass === 'upcoming' ? 'blue' : statusClass === 'submitted' ? 'teal' : statusClass === 'due-soon' ? 'amber' : 'red'}">${statusLabel}</span>
          </div>
          <div class="assign-meta">
            <div class="meta-item">${ICON_SUBJECT} ${escapeHtml(a.subject)}</div>
            <div class="meta-item">${ICON_TEACHER} ${escapeHtml(teacher)}</div>
            <div class="meta-item">${ICON_CALENDAR} Due ${formatDeadline(a.deadline)}</div>
          </div>
          ${a.description ? `<div class="assign-desc">${escapeHtml(a.description)}</div>` : ""}
        </div>
        <div class="assign-right">
          <div class="deadline-info">
            <div class="deadline-countdown ${dClass}">${escapeHtml(countdown)}</div>
            <div class="deadline-date">${formatDate(a.deadline)}</div>
          </div>
          ${!submitted
            ? `<button class="btn-primary btn-sm btn-submit-trigger" data-id="${escapeHtml(a.id)}" data-title="${escapeHtml(a.title)}">${ICON_SUBMIT} Submit Now</button>`
            : `<button class="btn-ghost btn-sm" disabled>✓ Submitted</button>`}
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".btn-submit-trigger").forEach(btn => {
    btn.addEventListener("click", () => openSubmitModal(btn.dataset.id, btn.dataset.title));
  });
}

export function initAssignmentFilters() {
  const chips = document.querySelectorAll("#assignment-status-filters .filter-chip");
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.status;
      applyFilters();
    });
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
