/**
 * student/announcements.js
 * Announcements feed for student portal.
 * Cache-first: re-renders from state on re-navigation.
 */

import { announcements } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDate } from "../shared/helpers.js";

export async function fetchAnnouncements() {
  const feed = $("announcements-feed");

  // Cache-first
  if (state.announcementsLoaded && state.cachedAnnouncements) {
    renderAnnouncements(feed, state.cachedAnnouncements);
    return;
  }

  feed.innerHTML = `<div class="empty-state-sm">Loading…</div>`;

  try {
    const { announcements: data } = await announcements.list();
    state.cachedAnnouncements = data || [];
    state.announcementsLoaded = true;
    renderAnnouncements(feed, state.cachedAnnouncements);
  } catch (err) { feed.innerHTML = `<div class="empty-state-sm">Error: ${escapeHtml(err.message)}</div>`; }
}

function renderAnnouncements(feed, data) {
  if (!data?.length) { feed.innerHTML = `<div class="empty-state-sm">No announcements yet.</div>`; return; }

  feed.innerHTML = data.map(a => {
    const teacher = a.users?.full_name
      || `${a.users?.first_name || ""} ${a.users?.last_name || ""}`.trim()
      || "Teacher";
    return `
      <div class="announcement-card">
        <div class="announcement-header">
          <div class="announcement-title">${escapeHtml(a.title)}</div>
          <div class="announcement-date">${formatDate(a.created_at)}</div>
        </div>
        <div class="announcement-teacher">📢 ${escapeHtml(teacher)}</div>
        <div class="announcement-message">${escapeHtml(a.message)}</div>
      </div>`;
  }).join("");
}
