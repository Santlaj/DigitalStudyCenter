/**
 * student/dashboard.js
 * Dashboard stats and recent items for student portal.
 * Cache-first: data is fetched once and re-rendered from state.
 */

import { users, notes, assignments } from "../api.js";
import { state } from "./state.js";
import { $, escHtml, formatDate, formatDeadline } from "../shared/helpers.js";

export async function fetchDashboardStats() {
  if (state.dashboardLoaded) {
    if (state.cachedStats) renderStats(state.cachedStats);
    renderDashRecentNotes(state.cachedDashNotes);
    renderDashRecentAssignments(state.cachedDashAssign);
    return;
  }

  try {
    const { stats } = await users.getDashboardStats();
    state.cachedStats = stats;
    renderStats(stats);
  } catch (err) { console.warn("Stats error:", err.message); }

  try {
    const { submittedIds: ids } = await assignments.getSubmissions();
    state.submittedIds = new Set(ids);
  } catch (e) { /* ignore */ }

  await Promise.all([loadDashRecentNotes(), loadDashRecentAssignments()]);
  state.dashboardLoaded = true;
}

function renderStats(stats) {
  $("stat-courses").textContent     = stats.courses ?? "—";
  $("stat-notes").textContent       = stats.notes ?? "—";
  $("stat-assignments").textContent = stats.pendingAssignments ?? "—";

  if (stats.announcements > 0) {
    $("notif-badge").textContent = stats.announcements > 9 ? "9+" : stats.announcements;
    $("notif-badge").classList.remove("hidden");
  } else {
    $("notif-badge").classList.add("hidden");
  }
}

async function loadDashRecentNotes() {
  try {
    const { notes: data } = await notes.recent();
    state.cachedDashNotes = data || [];
    renderDashRecentNotes(state.cachedDashNotes);
  } catch (e) {
    $("dash-recent-notes").innerHTML = `<div class="empty-state-sm">Could not load notes.</div>`;
  }
}

function renderDashRecentNotes(data) {
  const el = $("dash-recent-notes");
  if (!data?.length) { el.innerHTML = `<div class="empty-state-sm">No notes available yet.</div>`; return; }
  el.innerHTML = data.map(n => `
    <div class="recent-item">
      <div class="recent-dot"></div>
      <div class="recent-info">
        <div class="recent-title">${escHtml(n.title)}</div>
        <div class="recent-meta">${escHtml(n.subject)} · ${formatDate(n.created_at)}</div>
      </div>
      <span class="recent-badge badge-blue">PDF</span>
    </div>
  `).join("");
}

async function loadDashRecentAssignments() {
  try {
    const { assignments: data } = await assignments.list();
    state.cachedDashAssign = data || [];
    renderDashRecentAssignments(state.cachedDashAssign);
  } catch (e) {
    $("dash-recent-assignments").innerHTML = `<div class="empty-state-sm">Could not load assignments.</div>`;
  }
}

function renderDashRecentAssignments(data) {
  const recent = (data || []).slice(0, 5);
  const el = $("dash-recent-assignments");
  if (!recent.length) { el.innerHTML = `<div class="empty-state-sm">No assignments yet.</div>`; return; }
  el.innerHTML = recent.map(a => {
    const diff = a.deadline ? new Date(a.deadline) - new Date() : null;
    let cls = "badge-green", txt = "Upcoming";
    if (diff === null)        { cls = "badge-gray";  txt = "No deadline"; }
    else if (diff < 0)        { cls = "badge-red";   txt = "Overdue"; }
    else if (diff < 86400000) { cls = "badge-amber"; txt = "Due today"; }
    const done = state.submittedIds.has(a.id);
    if (done) { cls = "badge-teal"; txt = "Submitted"; }
    return `
      <div class="recent-item">
        <div class="recent-dot" style="background:var(--amber)"></div>
        <div class="recent-info">
          <div class="recent-title">${escHtml(a.title)}</div>
          <div class="recent-meta">${escHtml(a.subject)} · ${formatDeadline(a.deadline)}</div>
        </div>
        <span class="recent-badge ${cls}">${txt}</span>
      </div>
    `;
  }).join("");
}
