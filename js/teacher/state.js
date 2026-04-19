/**
 * teacher/state.js
 * Shared mutable state for the teacher dashboard modules.
 */

export const state = {
  currentTeacher:    null,
  teacherProfile:    null,
  allNotes:          [],
  allAssignments:    [],
  allStudents:       [],
  deleteCallback:    null,
  syncIntervalId:    null,

  // Attendance
  attStudents:       [],
  attStatusMap:      {},
  attNoteMap:        {},
  attSessionId:      null,
  viewingSessionId:  null,
  attendanceSessions: [],

  // Announcements
  allAnnouncements:  [],

  // Dashboard cached stats
  cachedStats:       null,

  // ═══ Paging ═══
  studentsOffset:      0,
  notesOffset:         0,
  assignmentsOffset:   0,

  // ═══ Loaded flags ═══
  // When true, the section re-renders from cached state instead of calling API
  dashboardLoaded:     false,
  notesLoaded:         false,
  assignmentsLoaded:   false,
  studentsLoaded:      false,
  attendanceLoaded:    false,
  announcementsLoaded: false,
};

/** Reset all loaded flags (e.g. on logout) */
export function resetAllCache() {
  state.dashboardLoaded     = false;
  state.notesLoaded         = false;
  state.assignmentsLoaded   = false;
  state.studentsLoaded      = false;
  state.attendanceLoaded    = false;
  state.announcementsLoaded = false;
  if (state.syncIntervalId) { clearInterval(state.syncIntervalId); state.syncIntervalId = null; }
  state.cachedStats         = null;
  state.allNotes            = [];
  state.allAssignments      = [];
  state.allStudents         = [];
  state.attendanceSessions  = [];
  state.allAnnouncements    = [];
  state.studentsOffset      = 0;
  state.notesOffset         = 0;
  state.assignmentsOffset   = 0;
}
