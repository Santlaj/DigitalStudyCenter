/**
 * teacher/dashboard.js
 * Dashboard stats and recent items for teacher portal.
 * Uses cache-first strategy: data is fetched once and re-rendered from state.
 */

import { state } from "./state.js";
import { $, escapeHtml, formatDate, formatDeadline } from "../shared/helpers.js";

export async function fetchDashboardStats() {
  if (state.cachedStats) renderStats(state.cachedStats);
  if (state.cachedRecentNotes) renderRecentNotes(state.cachedRecentNotes);
  if (state.cachedRecentAssignments) renderRecentAssignments(state.cachedRecentAssignments);
}

function renderStats(stats) {
  $("stat-students").textContent = stats.students ?? "0";
  $("stat-notes").textContent = stats.notes ?? "0";
  $("stat-assignments").textContent = stats.assignments ?? "0";
}

function renderRecentNotes(data) {
  const recent = (data || []).slice(0, 5);
  const el = $("recent-notes-list");
  if (!recent.length) { el.innerHTML = `<div class="empty-state-sm">No notes uploaded yet.</div>`; return; }
  el.innerHTML = recent.map(n => `
    <div class="recent-item">
      <div class="recent-dot"></div>
      <div class="recent-info">
        <div class="recent-title">${escapeHtml(n.title)}</div>
        <div class="recent-meta">${escapeHtml(n.subject)} · ${formatDate(n.created_at)}</div>
      </div>
      <span class="recent-badge badge-purple">PDF</span>
    </div>
  `).join("");
}

function renderRecentAssignments(data) {
  const recent = (data || []).slice(0, 5);
  const el = $("recent-assignments-list");
  if (!recent.length) { el.innerHTML = `<div class="empty-state-sm">No assignments posted yet.</div>`; return; }
  el.innerHTML = recent.map(a => {
    const diff = a.deadline ? new Date(a.deadline) - new Date() : null;
    let cls = "badge-green", txt = "Upcoming";
    if (diff === null) {
      cls = "badge-gray";
      txt = "No deadline";
    }
    else if (diff < 0) {
      cls = "badge-red";
      txt = "Overdue";
    }
    else if (diff < 86400000) {
      cls = "badge-amber";
      txt = "Due today";
    }

    return `
      <div class="recent-item">
        <div class="recent-dot" style="background:var(--amber)"></div>
        <div class="recent-info">
          <div class="recent-title">${escapeHtml(a.title)}</div>
          <div class="recent-meta">${escapeHtml(a.subject)} · ${formatDeadline(a.deadline)}</div>
        </div>
        <span class="recent-badge ${cls}">${txt}</span>
      </div>`;
  }).join("");
}
