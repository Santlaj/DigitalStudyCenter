/**
 * teacher/announcements.js
 * Teacher announcement logic
 * Uses cache-first: re-renders from state.allAnnouncements if already loaded.
 */

import { $, escapeHtml, formatDate, showToast } from "../shared/helpers.js";
import { announcements } from "../api.js";
import { state } from "./state.js";

export async function fetchTeacherAnnouncements() {
  const feed = $("teacher-ann-list");
  const countLabel = $("ann-count");
  if (!feed) return;

  // Cache-first: if already loaded, re-render from state
  if (state.announcementsLoaded && state.allAnnouncements) {
    renderAnnouncements(feed, countLabel, state.allAnnouncements);
    return;
  }

  try {
    feed.innerHTML = `<div class="empty-state-sm">Loading announcements...</div>`;
    const { announcements: data } = await announcements.list();
    state.allAnnouncements = data || [];
    state.announcementsLoaded = true;
    renderAnnouncements(feed, countLabel, state.allAnnouncements);
  } catch (err) {
    console.error("Failed to load announcements:", err);
    feed.innerHTML = `<div class="empty-state-sm" style="color: var(--red);">Error loading announcements.</div>`;
  }
}

function renderAnnouncements(feed, countLabel, data) {
  const myId = JSON.parse(localStorage.getItem("_user") || "{}").id;
  countLabel.textContent = `${data?.length || 0} items`;

  if (!data?.length) {
    feed.innerHTML = `<div class="empty-state-sm">No announcements yet.</div>`;
    return;
  }

  feed.innerHTML = data.map(a => {
    const isMine = a.teacher_id === myId;
    const teacherName = a.users?.full_name || `${a.users?.first_name || ""} ${a.users?.last_name || ""}`.trim() || "Teacher";
    return `
      <div class="announcement-card" style="background: var(--bg-card); border: 1px solid var(--border); padding: 12px; border-radius: 8px;">
        <div class="announcement-header" style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <div class="announcement-title" style="font-weight: 600; color: var(--text-main);">${escapeHtml(a.title)}</div>
          <div class="announcement-date" style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(a.created_at)}</div>
        </div>
        <div class="announcement-teacher" style="font-size: 0.8rem; color: var(--accent); margin-bottom: 6px;">
          📢 ${escapeHtml(teacherName)} ${isMine ? "(You)" : ""}
        </div>
        <div class="announcement-message" style="color: var(--text-sub); white-space: pre-wrap; font-size: 0.875rem;">${escapeHtml(a.message)}</div>
      </div>
    `;
  }).join("");
}


export async function postAnnouncement(closeModalFn) {
  const titleInput = $("ann-title");
  const msgInput = $("ann-message");
  const courseInput = $("ann-course");
  const btn = $("btn-post-ann");

  const title = titleInput.value.trim();
  const message = msgInput.value.trim();
  const course = courseInput.value;

  if (!title || !message) {
    return showToast("Please fill in both title and message.", "error");
  }

  try {
    btn.disabled = true;
    btn.textContent = "Posting...";

    await announcements.create({ title, message, course });

    showToast("Announcement posted!", "success");
    titleInput.value = "";
    msgInput.value = "";
    courseInput.value = "all";

    // Close modal and refresh list
    if (closeModalFn) closeModalFn();
    state.announcementsLoaded = false;
    await fetchTeacherAnnouncements();
  } catch (err) {
    console.error(err);
    showToast("Failed to post announcement.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Post Announcement";
  }
}
