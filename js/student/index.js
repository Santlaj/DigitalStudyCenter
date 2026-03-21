/**
 * student/index.js
 * Entry point — imports all student modules, handles navigation & event wiring.
 */

import { $, $$ } from "../shared/helpers.js";
import { boot, logoutStudent }               from "./boot.js";
import { fetchDashboardStats }               from "./dashboard.js";
import { fetchNotes }                        from "./notes.js";
import { fetchAssignments, submitAssignment, closeSubmitModal, initSubmitFileDrop } from "./assignments.js";
import { fetchAttendance }                   from "./attendance.js";
import { fetchFeePayment, updateFeeStatCard } from "./fees.js";
import { fetchAnnouncements }                from "./announcements.js";
import { loadActivityChart }                 from "./chart.js";
import { saveProfile }                       from "./profile.js";
import { loadDashAttendancePreview }         from "./attendance.js";

/* ═══════════════════ NAVIGATION ═══════════════════ */

function navigateTo(section) {
  $$(".section").forEach(s => s.classList.remove("active"));
  const el = $(`section-${section}`);
  if (el) el.classList.add("active");

  $$(".nav-item").forEach(n => n.classList.remove("active"));
  $$(`[data-section="${section}"]`).forEach(n => n.classList.add("active"));

  if (section === "notes")         fetchNotes();
  if (section === "assignments")   fetchAssignments();
  if (section === "attendance")    fetchAttendance();
  if (section === "fee-payment")   fetchFeePayment();
  if (section === "announcements") fetchAnnouncements();
  if (section === "dashboard")     loadActivityChart();

  if (window.innerWidth <= 768) $("sidebar").classList.remove("open");
  document.querySelector(".main-content").scrollTop = 0;
}

function setupGlobalSearch() {
  const input = $("global-search");
  if (!input) return; // Search bar removed from UI
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { const q = input.value.trim(); if (!q) return; navigateTo("notes"); fetchNotes(q); }, 400);
  });
}

/* ═══════════════════ EVENT WIRING ═══════════════════ */

function wireEvents() {
  $$(".nav-item[data-section]").forEach(item =>
    item.addEventListener("click", () => navigateTo(item.dataset.section))
  );

  const attRefreshBtn = $("att-refresh-btn");
  if (attRefreshBtn) {
    attRefreshBtn.addEventListener("click", () => {
      attRefreshBtn.style.pointerEvents = "none";
      attRefreshBtn.querySelector("svg").style.transform = "rotate(360deg)";
      fetchAttendance().finally(() => {
        setTimeout(() => { attRefreshBtn.style.pointerEvents = ""; attRefreshBtn.querySelector("svg").style.transform = ""; }, 800);
      });
    });
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-section]");
    if (link && !link.classList.contains("nav-item")) navigateTo(link.dataset.section);
  });

  $("topnav-logout").addEventListener("click",  logoutStudent);

  $("sidebar-toggle").addEventListener("click", () => {
    if (window.innerWidth <= 768) $("sidebar").classList.toggle("open");
    else document.body.classList.toggle("sidebar-collapsed");
  });

  $("notif-btn").addEventListener("click", () => navigateTo("announcements"));

  let notesTimer;
  $("notes-search").addEventListener("input", () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => fetchNotes($("notes-search").value), 350);
  });

  let assignTimer;
  $("assignments-search").addEventListener("input", () => {
    clearTimeout(assignTimer);
    assignTimer = setTimeout(() => fetchAssignments($("assignments-search").value), 350);
  });

  $("submit-confirm-btn").addEventListener("click", submitAssignment);
  $("submit-cancel-btn").addEventListener("click",  closeSubmitModal);
  $("submit-modal-close").addEventListener("click", closeSubmitModal);
  $("submit-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeSubmitModal(); });

  $("topnav-student-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("header-profile-popup")?.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#topnav-student-btn")) {
      $("header-profile-popup")?.classList.add("hidden");
    }
  });

  initSubmitFileDrop();
  setupGlobalSearch();
}

/* ═══════════════════ INIT ═══════════════════ */

document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  boot(async () => {
    fetchDashboardStats();
    await updateFeeStatCard();
    await loadDashAttendancePreview();
  });
  setTimeout(loadActivityChart, 600);
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
