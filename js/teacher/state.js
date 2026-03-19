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
  chartsInitialised: false,

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
  state.chartsInitialised   = false;
  state.cachedStats         = null;
  state.allNotes            = [];
  state.allAssignments      = [];
  state.allStudents         = [];
  state.attendanceSessions  = [];
  state.allAnnouncements    = [];
}
