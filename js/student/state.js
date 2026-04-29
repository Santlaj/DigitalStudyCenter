/* Shared mutable state for the student dashboard. */

export const state = {
  currentStudent:   null,
  studentProfile:   null,
  allNotes:         [],
  allAssignments:   [],
  allFeeRecords:    [],
  submittedIds:     new Set(),
  pendingSubmit:    null,
  chartInitialised: false,
  syncIntervalId:   null,

  // Cached data
  cachedStats:        null,
  cachedDashNotes:    [],
  cachedDashAssign:   [],
  cachedAttendance:   null,
  cachedFee:          null,
  cachedFeeHistory:   [],
  cachedAnnouncements:[],
  cachedCourses:      [],

  // Paging
  notesOffset:         0,
  assignmentsOffset:   0,

  // Loaded flags
  dashboardLoaded:     false,
  notesLoaded:         false,
  assignmentsLoaded:   false,
  attendanceLoaded:    false,
  feesLoaded:          false,
  announcementsLoaded: false,
  coursesLoaded:       false,
};

// Reset all loaded flags (e.g. on logout)
export function resetAllCache() {
  state.dashboardLoaded     = false;
  state.notesLoaded         = false;
  state.assignmentsLoaded   = false;
  state.attendanceLoaded    = false;
  state.feesLoaded          = false;
  state.announcementsLoaded = false;
  state.coursesLoaded       = false;
  state.chartInitialised    = false;

  if (state.syncIntervalId) {
     clearInterval(state.syncIntervalId); state.syncIntervalId = null; 
  }
  
  state.cachedStats         = null;
  state.cachedAttendance    = null;
  state.cachedFee           = null;
  state.allNotes            = [];
  state.allAssignments      = [];
  state.allFeeRecords       = [];
  state.cachedDashNotes     = [];
  state.cachedDashAssign    = [];
  state.cachedFeeHistory    = [];
  state.cachedAnnouncements = [];
  state.cachedCourses       = [];
  state.submittedIds        = new Set();
  state.notesOffset         = 0;
  state.assignmentsOffset   = 0;
}
