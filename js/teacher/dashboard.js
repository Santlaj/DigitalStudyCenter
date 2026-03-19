/**
 * teacher/dashboard.js
 * Dashboard stats and recent items for teacher portal.
 * Uses cache-first strategy: data is fetched once and re-rendered from state.
 */

import { users, notes, assignments } from "../api.js";
import { state } from "./state.js";
import { $, escHtml, formatDate, formatDeadline } from "../shared/helpers.js";

export async function fetchDashboardStats() {
  if (state.dashboardLoaded) {
    // Re-render from cached data without API calls
    if (state.cachedStats) renderStats(state.cachedStats);
    renderRecentNotes(state.recentNotes);
    renderRecentAssignments(state.recentAssignments);
    return;
  }

  try {
    const { stats } = await users.getDashboardStats();
    state.cachedStats = stats;
    renderStats(stats);
  } catch (err) { console.warn("Stats fetch error:", err.message); }

  await Promise.all([loadRecentNotes(), loadRecentAssignments()]);
  state.dashboardLoaded = true;
}

function renderStats(stats) {
  $("stat-students").textContent    = stats.students ?? "—";
  $("stat-notes").textContent       = stats.notes ?? "—";
  $("stat-assignments").textContent = stats.assignments ?? "—";
}

async function loadRecentNotes() {
  try {
    const { notes: data } = await notes.teacherNotes();
    state.allNotes = data || [];
    renderRecentNotes(state.allNotes);
  } catch (e) { $("recent-notes-list").innerHTML = `<div class="empty-state-sm">Could not load notes.</div>`; }
}

function renderRecentNotes(data) {
  const recent = (data || []).slice(0, 5);
  const el = $("recent-notes-list");
  if (!recent.length) { el.innerHTML = `<div class="empty-state-sm">No notes uploaded yet.</div>`; return; }
  el.innerHTML = recent.map(n => `
    <div class="recent-item">
      <div class="recent-dot"></div>
      <div class="recent-info">
        <div class="recent-title">${escHtml(n.title)}</div>
        <div class="recent-meta">${escHtml(n.subject)} · ${formatDate(n.created_at)}</div>
      </div>
      <span class="recent-badge badge-purple">PDF</span>
    </div>
  `).join("");
}

async function loadRecentAssignments() {
  try {
    const { assignments: data } = await assignments.teacherAssignments();
    state.allAssignments = data || [];
    renderRecentAssignments(state.allAssignments);
  } catch (e) { $("recent-assignments-list").innerHTML = `<div class="empty-state-sm">Could not load assignments.</div>`; }
}

function renderRecentAssignments(data) {
  const recent = (data || []).slice(0, 5);
  const el = $("recent-assignments-list");
  if (!recent.length) { el.innerHTML = `<div class="empty-state-sm">No assignments posted yet.</div>`; return; }
  el.innerHTML = recent.map(a => {
    const diff = a.deadline ? new Date(a.deadline) - new Date() : null;
    let cls = "badge-green", txt = "Upcoming";
    if (diff === null)        { cls = "badge-gray";  txt = "No deadline"; }
    else if (diff < 0)        { cls = "badge-red";   txt = "Overdue"; }
    else if (diff < 86400000) { cls = "badge-amber"; txt = "Due today"; }
    return `
      <div class="recent-item">
        <div class="recent-dot" style="background:var(--amber)"></div>
        <div class="recent-info">
          <div class="recent-title">${escHtml(a.title)}</div>
          <div class="recent-meta">${escHtml(a.subject)} · ${formatDeadline(a.deadline)}</div>
        </div>
        <span class="recent-badge ${cls}">${txt}</span>
      </div>`;
  }).join("");
}
