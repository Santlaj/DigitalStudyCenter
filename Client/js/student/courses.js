/**
 * student/courses.js
 * Course cards for student portal.
 * Cache-first: re-renders from state on re-navigation.
 */

import { courses } from "../api.js";
import { state } from "./state.js";
import { $, escHtml, COURSE_COLORS } from "../shared/helpers.js";

export async function fetchCourses() {
  const grid = $("courses-grid");

  // Cache-first
  if (state.coursesLoaded && state.cachedCourses) {
    renderCourseCards(grid, state.cachedCourses);
    return;
  }

  grid.innerHTML = `<div class="empty-state">Loading courses…</div>`;

  try {
    const { courses: data } = await courses.list();
    state.cachedCourses = data || [];
    state.coursesLoaded = true;
    renderCourseCards(grid, state.cachedCourses);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${escHtml(err.message)}</div>`;
  }
}

function renderCourseCards(grid, data) {
  if (!data?.length) { grid.innerHTML = `<div class="empty-state">No courses available yet.</div>`; return; }

  grid.innerHTML = data.map((c, idx) => {
    const teacher  = c.users?.full_name
      || `${c.users?.first_name || ""} ${c.users?.last_name || ""}`.trim()
      || "Teacher";
    const gradient = COURSE_COLORS[idx % COURSE_COLORS.length];
    const notesCnt = c.notes_count || 0;
    const assnCnt  = c.assignments_count || 0;
    return `
      <div class="course-card">
        <div class="course-card-header">
          <div class="course-card-bar" style="background:${gradient}"></div>
          <div class="course-card-title">${escHtml(c.title)}</div>
          <div class="course-card-teacher">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            ${escHtml(teacher)}
          </div>
          ${c.description ? `<div class="course-card-desc">${escHtml(c.description)}</div>` : ""}
        </div>
        <div class="course-card-footer">
          <div class="course-stat">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
            ${notesCnt} notes
          </div>
          <div class="course-stat">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" clip-rule="evenodd"/></svg>
            ${assnCnt} assignments
          </div>
        </div>
      </div>
    `;
  }).join("");
}
