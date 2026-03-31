/**
 * student/dashboard.js
 * Dashboard stats and recent items for student portal.
 * Cache-first: data is fetched once and re-rendered from state.
 */

import { state } from "./state.js";
import { $, escapeHtml, formatDate, formatDeadline } from "../shared/helpers.js";

export async function fetchDashboardStats() {
  if (state.cachedStats) renderStats(state.cachedStats);
  if (state.cachedDashNotes) renderDashRecentNotes(state.cachedDashNotes);
  if (state.cachedDashAssign) renderDashRecentAssignments(state.cachedDashAssign);
}

function renderStats(stats) {
  $("stat-notes").textContent        = stats.notes ?? "0";
  $("stat-assignments").textContent  = stats.assignments ?? "0";
  if ($("attendance-pct")) {
    $("attendance-pct").textContent  = (stats.attendancePct ?? 0) + "%";
  }

  const annCount = stats.announcements || 0;
  if (annCount > 0) {
    $("notif-badge").textContent = annCount > 9 ? "9+" : annCount;
    $("notif-badge").classList.remove("hidden");
  } else {
    $("notif-badge").classList.add("hidden");
  }
}

function renderDashRecentNotes(data) {
  const el = $("dash-recent-notes");
  if (!el) return;
  if (!data?.length) { el.innerHTML = `<div class="empty-state-sm">No notes available yet.</div>`; return; }
  el.innerHTML = data.map(n => `
    <div class="recent-item">
      <div class="recent-dot"></div>
      <div class="recent-info">
        <div class="recent-title">${escapeHtml(n.title)}</div>
        <div class="recent-meta">${escapeHtml(n.subject)} · ${formatDate(n.created_at)}</div>
      </div>
      <span class="recent-badge badge-blue">PDF</span>
    </div>
  `).join("");
}

function renderDashRecentAssignments(data) {
  const recent = (data || []).slice(0, 5);
  const el = $("dash-recent-assignments");
  if (!el) return;
  if (!recent.length) { el.innerHTML = `<div class="empty-state-sm">No assignments yet.</div>`; return; }
  el.innerHTML = recent.map(a => {
    const diff = a.deadline ? new Date(a.deadline) - new Date() : null;
    let cls = "badge-green", txt = "Upcoming";
    if (diff === null)        { cls = "badge-gray";  txt = "No deadline"; }
    else if (diff < 0)        { cls = "badge-red";   txt = "Overdue"; }
    else if (diff < 86400000) { cls = "badge-amber"; txt = "Due today"; }
    const done = state.submittedIds && state.submittedIds.has(a.id);
    if (done) { cls = "badge-teal"; txt = "Submitted"; }
    return `
      <div class="recent-item">
        <div class="recent-dot" style="background:var(--amber)"></div>
        <div class="recent-info">
          <div class="recent-title">${escapeHtml(a.title)}</div>
          <div class="recent-meta">${escapeHtml(a.subject)} · ${formatDeadline(a.deadline)}</div>
        </div>
        <span class="recent-badge ${cls}">${txt}</span>
      </div>
    `;
  }).join("");
}
