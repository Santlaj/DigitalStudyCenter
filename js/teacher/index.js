/* teacher/index.js — Entry point for teacher portal: imports modules and wires events. */

import { $, $$, debounce } from "../shared/helpers.js";
import { state }                             from "./state.js";
import { boot, logoutTeacher }               from "./boot.js";
import { fetchDashboardStats }               from "./dashboard.js";
import { uploadNotes, resetUploadForm, loadNotesTable, initFileDrop } from "./notes.js";
import { createAssignment, loadAssignmentsTable }                    from "./assignments.js";
import { fetchStudents, openAddStudentModal, closeAddStudentModal, addStudent, autoMarkInactiveUnpaid } from "./students.js";
import { saveProfile }                       from "./profile.js";
import {
  setDefaultAttDate, loadStudentsForAttendance,
  saveAttendance, loadAttendanceHistory, markAll,
  closeAttDetailModal,
} from "./attendance.js";
import { fetchTeacherAnnouncements, postAnnouncement } from "./announcements.js";
import { initTeacherDoubts, renderTeacherDoubts }      from "./doubts.js";

// DELETE MODAL
function openDeleteModal(name, callback) {
  $("delete-item-name").textContent = name;
  state.deleteCallback = callback;
  $("delete-modal").classList.add("open");
}
// Expose globally so notes.js and assignments.js can use it
window._openDeleteModal = openDeleteModal;

function closeDeleteModal() {
  $("delete-modal").classList.remove("open");
  state.deleteCallback = null;
}


// NAVIGATION MAP
const SECTION_TITLES = {
  "dashboard": "Dashboard", "my-notes": "My Notes",
  "assignments": "Assignments", "students": "Students & Analytics",
  "attendance": "Attendance", "profile": "Profile", "announcements": "Announcements",
};

function navigateTo(section) {
  $$(".section").forEach(s => s.classList.remove("active"));
  const el = $(`section-${section}`);
  if (el) el.classList.add("active");

  $$(".nav-item").forEach(n => n.classList.remove("active"));
  $$(`[data-section="${section}"]`).forEach(n => n.classList.add("active"));

  $("topnav-breadcrumb").textContent = SECTION_TITLES[section] || "Dashboard";

  if (section === "my-notes")    loadNotesTable();
  if (section === "assignments") loadAssignmentsTable();
  if (section === "students")    fetchStudents();
  if (section === "attendance")  { loadAttendanceHistory(); setDefaultAttDate(); }
  if (section === "doubts")      renderTeacherDoubts();
  if (section === "announcements") fetchTeacherAnnouncements();

  if (window.innerWidth <= 768) $("sidebar").classList.remove("open");
  document.querySelector(".main-content").scrollTop = 0;
}


// EVENT WIRING
function wireEvents() {
  $$(".nav-item[data-section]").forEach(item =>
    item.addEventListener("click", () => navigateTo(item.dataset.section))
  );

  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-section]");
    if (link && !link.classList.contains("nav-item")) navigateTo(link.dataset.section);
  });

  $("topnav-logout").addEventListener("click",  logoutTeacher);
  
  if ($("notif-btn")) {
    $("notif-btn").addEventListener("click", () => navigateTo("announcements"));
  }

  $("sidebar-toggle").addEventListener("click", () => {
    if (window.innerWidth <= 768) $("sidebar").classList.toggle("open");
    else document.body.classList.toggle("sidebar-collapsed");
  });

  $("sidebar-inner-collapse").addEventListener("click", () => {
    if (window.innerWidth <= 768) return;
    const sidebar = $("sidebar"), mainWrap = document.querySelector(".main-wrap");
    const isNowCollapsed = sidebar.classList.toggle("sidebar-icon-only");
    mainWrap.style.marginLeft = isNowCollapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)";
  });

  // Upload Notes — open modal instead of navigating
  $("btn-open-upload-modal").addEventListener("click", () => $("upload-notes-modal").classList.add("open"));
  $("upload-modal-close").addEventListener("click", () => $("upload-notes-modal").classList.remove("open"));
  $("upload-notes-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("upload-notes-modal").classList.remove("open"); });
  $("upload-notes-btn").addEventListener("click", () => uploadNotes(() => {
    $("upload-notes-modal").classList.remove("open");
    loadNotesTable();
  }));
  $("upload-reset-btn").addEventListener("click", resetUploadForm);

  // New Assignment — modal
  $("btn-open-assign-modal").addEventListener("click", () => {
    // Restrict deadline input to future dates/times based on local time
    const now = new Date();
    const localISOTime = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $("assign-deadline").min = localISOTime;
    $("assign-modal").classList.add("open");
  });
  $("assign-modal-close").addEventListener("click", () => $("assign-modal").classList.remove("open"));
  $("assign-cancel-btn").addEventListener("click", () => $("assign-modal").classList.remove("open"));
  $("assign-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("assign-modal").classList.remove("open"); });
  $("create-assignment-btn").addEventListener("click", () => createAssignment(() => $("assign-modal").classList.remove("open")));

  // New Announcement — modal
  $("btn-open-ann-modal").addEventListener("click", () => $("ann-modal").classList.add("open"));
  $("ann-modal-close").addEventListener("click", () => $("ann-modal").classList.remove("open"));
  $("ann-cancel-btn").addEventListener("click", () => $("ann-modal").classList.remove("open"));
  $("ann-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("ann-modal").classList.remove("open"); });

  // Announcements
  if ($("btn-post-ann")) {
    $("btn-post-ann").addEventListener("click", () => postAnnouncement(() => $("ann-modal").classList.remove("open")));
  }

  // Search
  $("notes-search").addEventListener("input", debounce(() => {
    loadNotesTable($("notes-search").value);
  }, 500));
  
  $("students-search").addEventListener("input", debounce(() => {
    fetchStudents($("students-search").value);
  }, 500));

  // Delete modal
  $("delete-confirm-btn").addEventListener("click", async () => {
    if (state.deleteCallback) { $("delete-confirm-btn").disabled = true; await state.deleteCallback(); $("delete-confirm-btn").disabled = false; }
    closeDeleteModal();
  });
  $("delete-cancel-btn").addEventListener("click",  closeDeleteModal);
  $("delete-modal-close").addEventListener("click", closeDeleteModal);
  $("delete-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeDeleteModal(); });

  // Profile
  $("profile-save-btn").addEventListener("click", saveProfile);

  // Attendance
  $("att-load-btn").addEventListener("click", loadStudentsForAttendance);
  $("att-save-btn").addEventListener("click", saveAttendance);
  $("att-refresh-history").addEventListener("click", loadAttendanceHistory);
  $("att-mark-all-present").addEventListener("click", () => markAll("present"));
  $("att-mark-all-absent").addEventListener("click",  () => markAll("absent"));
  $("att-detail-close").addEventListener("click",     closeAttDetailModal);
  $("att-detail-close-btn").addEventListener("click", closeAttDetailModal);
  $("att-detail-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeAttDetailModal(); });

  // Add Student modal
  $("btn-add-student").addEventListener("click", openAddStudentModal);
  $("add-student-modal-close").addEventListener("click", closeAddStudentModal);
  $("add-student-cancel-btn").addEventListener("click", closeAddStudentModal);
  $("add-student-btn").addEventListener("click", addStudent);
  $("add-student-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeAddStudentModal(); });

  // Fees auto-mark
  $("btn-auto-mark-inactive").addEventListener("click", autoMarkInactiveUnpaid);

  initFileDrop();
}


// INIT
document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  initTeacherDoubts();
  boot(async () => {
    fetchDashboardStats();
  });
});


// Dynamically handle dark mode and sidebar inner collapse clicks via delegation
document.addEventListener("click", (e) => {
  const dmToggle = e.target.closest("#dark-mode-toggle");
  if (dmToggle) {
    document.body.classList.toggle("dark-mode"); document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
  }
  
  const innerCollapse = e.target.closest("#sidebar-inner-collapse");
  if (innerCollapse) {
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.remove("open", "sidebar-open");
  }
});

// Check theme on load
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-mode"); document.documentElement.classList.add("dark-mode");
}
