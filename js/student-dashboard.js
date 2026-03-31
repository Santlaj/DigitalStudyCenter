/**
 * student-dashboard.js
 * DigitalStudyCenter — Student Dashboard
 * Uses backend API via api.js instead of direct Supabase calls.
 */

import {
  auth, notes, assignments, users, attendance,
  fees, courses, announcements, analytics, getUser, setUser,
} from "./api.js";

// MODULE STATE
let currentStudent = null;
let studentProfile = null;
let allNotes = [];
let allAssignments = [];
let allFeeRecords = [];
let submittedIds = new Set();
let pendingSubmit = null;
let chartInitialised = false;

// DOM HELPERS
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(message, type = "info") {
  const t = $("toast");
  t.textContent = message;
  t.className = `toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = "toast"; }, 3500);
}

function setLoading(btnEl, loading, idleHtml = "Submit") {
  if (!btnEl) return;
  btnEl.disabled = loading;
  btnEl.innerHTML = loading
    ? `<span class="spinner"></span>Please wait…`
    : idleHtml;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatDeadline(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function deadlineCountdown(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - new Date();
  if (diff < 0) return "Overdue";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return "Due very soon";
}

function deadlineClass(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - new Date();
  if (diff < 0) return "overdue";
  if (diff < 86400000) return "due-soon";
  return "";
}

function initials(name) {
  if (!name) return "S";
  return name.split(" ").map(p => p[0]?.toUpperCase() || "").filter(Boolean).slice(0, 2).join("");
}

function escHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const COURSE_COLORS = [
  "linear-gradient(90deg,#4f46e5,#6366f1)",
  "linear-gradient(90deg,#0ea5e9,#38bdf8)",
  "linear-gradient(90deg,#10b981,#34d399)",
  "linear-gradient(90deg,#f59e0b,#fbbf24)",
  "linear-gradient(90deg,#ef4444,#f87171)",
  "linear-gradient(90deg,#8b5cf6,#a78bfa)",
  "linear-gradient(90deg,#ec4899,#f472b6)",
];

function currentMonthLabel() {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// BOOT SETUP
async function boot() {
  try {
    const data = await auth.checkSession();
    currentStudent = data.user;
    studentProfile = data.user;

    // Role guard
    if (studentProfile.role && studentProfile.role !== "student") {
      window.location.href = "teacher-portal.html";
      return;
    }

    applyProfileToUI();
    showApp();
    await fetchDashboardStats();
  } catch (err) {
    console.error("Auth check failed:", err.message);
    window.location.href = "index.html";
  }
}
// PROFILE UI

function applyProfileToUI() {
  const name = studentProfile?.full_name
    || `${studentProfile?.first_name || ""} ${studentProfile?.last_name || ""}`.trim()
    || studentProfile?.email || "Student";

  const short = name.split(" ")[0] || "Student";
  const ini = initials(name);

  $("sidebar-user-name").textContent = name;
  $("sidebar-avatar-text").textContent = ini;
  $("topnav-name").textContent = short;
  $("topnav-avatar").textContent = ini;
  $("welcome-name").textContent = short;
  $("profile-display-name").textContent = name;
  $("profile-display-email").textContent = studentProfile?.email || "";
  $("profile-avatar-big").textContent = ini;
  $("profile-email").value = studentProfile?.email || "";
  $("profile-firstname").value = studentProfile?.first_name || "";
  $("profile-lastname").value = studentProfile?.last_name || "";
  $("profile-course").value = studentProfile?.course || "";
  $("profile-bio").value = studentProfile?.bio || "";
}

function showApp() {
  $("auth-guard").classList.add("hidden");
  $("app-shell").classList.add("visible");
}

// DASHBOARD STATS
async function fetchDashboardStats() {
  try {
    const { stats } = await users.getDashboardStats();

    $("stat-courses").textContent = stats.courses ?? "—";
    $("stat-notes").textContent = stats.notes ?? "—";
    $("stat-assignments").textContent = stats.pendingAssignments ?? "—";

    // Notification badge
    if (stats.announcements > 0) {
      $("notif-badge").textContent = stats.announcements > 9 ? "9+" : stats.announcements;
      $("notif-badge").classList.remove("hidden");
    } else {
      $("notif-badge").classList.add("hidden");
    }

    // Fee stat card
    await updateFeeStatCard();
    // Attendance mini preview
    await loadDashAttendancePreview();

  } catch (err) {
    console.warn("Stats error:", err.message);
  }

  // Refresh submitted IDs
  try {
    const { submittedIds: ids } = await assignments.getSubmissions();
    submittedIds = new Set(ids);
  } catch (e) { /* ignore */ }

  await Promise.all([loadDashRecentNotes(), loadDashRecentAssignments()]);
}

async function loadDashRecentNotes() {
  try {
    const { notes: data } = await notes.recent();
    const el = $("dash-recent-notes");
    if (!data?.length) {
      el.innerHTML = `<div class="empty-state-sm">No notes available yet.</div>`;
      return;
    }
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
  } catch (e) {
    $("dash-recent-notes").innerHTML = `<div class="empty-state-sm">Could not load notes.</div>`;
  }
}

async function loadDashRecentAssignments() {
  try {
    const { assignments: data } = await assignments.list();
    const recent = (data || []).slice(0, 5);
    const el = $("dash-recent-assignments");
    if (!recent.length) {
      el.innerHTML = `<div class="empty-state-sm">No assignments yet.</div>`;
      return;
    }
    el.innerHTML = recent.map(a => {
      const diff = a.deadline ? new Date(a.deadline) - new Date() : null;
      let cls = "badge-green", txt = "Upcoming";
      if (diff === null) { cls = "badge-gray"; txt = "No deadline"; }
      else if (diff < 0) { cls = "badge-red"; txt = "Overdue"; }
      else if (diff < 86400000) { cls = "badge-amber"; txt = "Due today"; }
      const done = submittedIds.has(a.id);
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
  } catch (e) {
    $("dash-recent-assignments").innerHTML = `<div class="empty-state-sm">Could not load assignments.</div>`;
  }
}

// COURSES
async function fetchCourses() {
  const grid = $("courses-grid");
  grid.innerHTML = `<div class="empty-state">Loading courses…</div>`;

  try {
    const { courses: data } = await courses.list();

    if (!data?.length) {
      grid.innerHTML = `<div class="empty-state">No courses available yet.</div>`;
      return;
    }

    grid.innerHTML = data.map((c, idx) => {
      const teacher = c.users?.full_name
        || `${c.users?.first_name || ""} ${c.users?.last_name || ""}`.trim()
        || "Teacher";
      const gradient = COURSE_COLORS[idx % COURSE_COLORS.length];
      const notesCnt = c.notes_count || 0;
      const assnCnt = c.assignments_count || 0;
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
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${escHtml(err.message)}</div>`;
  }
}

// NOTES LIST
async function fetchNotes(query = "") {
  const tbody = $("notes-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Loading…</td></tr>`;

  try {
    const { notes: data } = await notes.list(query);
    allNotes = data || [];
    $("notes-count").textContent = `${allNotes.length} note${allNotes.length !== 1 ? "s" : ""}`;

    if (!allNotes.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No notes available yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = allNotes.map(n => {
      const teacher = n.users?.full_name
        || `${n.users?.first_name || ""} ${n.users?.last_name || ""}`.trim()
        || "Teacher";
      return `
        <tr>
          <td>
            <strong>${escHtml(n.title)}</strong>
            ${n.description ? `<br><span style="font-size:0.78rem;color:var(--text-muted)">${escHtml(n.description.slice(0, 60))}${n.description.length > 60 ? "…" : ""}</span>` : ""}
          </td>
          <td><span class="pill pill-blue">${escHtml(n.subject)}</span></td>
          <td>${escHtml(teacher)}</td>
          <td>${formatDate(n.created_at)}</td>
          <td>
            <button class="btn-download"
              data-note-id="${escHtml(n.id)}"
              data-note-title="${escHtml(n.title)}"
              data-file-url="${escHtml(n.file_url)}">
              ↓ Download
            </button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-note-id]").forEach(btn => {
      btn.addEventListener("click", () =>
        downloadNote(btn.dataset.noteId, btn.dataset.noteTitle, btn.dataset.fileUrl)
      );
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

// DOWNLOAD NOTES
async function downloadNote(noteId, noteTitle, fileUrl) {
  if (!fileUrl) { showToast("File URL not available.", "error"); return; }

  try {
    await notes.download(noteId);
    window.open(fileUrl, "_blank", "noopener");
    showToast(`"${noteTitle}" download started.`, "success");
  } catch (err) {
    console.warn("Download log error:", err.message);
    window.open(fileUrl, "_blank", "noopener");
  }
}

// ASSIGNMENTS LIST
async function fetchAssignments(query = "") {
  const list = $("assignments-list");
  list.innerHTML = `<div class="empty-state-sm">Loading…</div>`;

  try {
    const { assignments: data } = await assignments.list(query);

    // Refresh submitted set
    try {
      const { submittedIds: ids } = await assignments.getSubmissions();
      submittedIds = new Set(ids);
    } catch (e) { /* ignore */ }

    allAssignments = data || [];
    $("assignments-count").textContent =
      `${allAssignments.length} assignment${allAssignments.length !== 1 ? "s" : ""}`;

    if (!allAssignments.length) {
      list.innerHTML = `<div class="empty-state-sm">No assignments yet.</div>`;
      return;
    }

    list.innerHTML = allAssignments.map(a => {
      const teacher = a.users?.full_name
        || `${a.users?.first_name || ""} ${a.users?.last_name || ""}`.trim()
        || "Teacher";
      const dClass = deadlineClass(a.deadline);
      const countdown = deadlineCountdown(a.deadline);
      const submitted = submittedIds.has(a.id);

      let statusPill = "";
      if (submitted) statusPill = `<span class="pill pill-teal">✓ Submitted</span>`;
      else if (dClass === "overdue") statusPill = `<span class="pill pill-red">Overdue</span>`;
      else if (dClass === "due-soon") statusPill = `<span class="pill pill-amber">Due today</span>`;
      else statusPill = `<span class="pill pill-green">Upcoming</span>`;

      return `
        <div class="assignment-card ${submitted ? "submitted" : dClass}">
          <div class="assignment-body">
            <div class="assignment-title">${escHtml(a.title)}</div>
            <div class="assignment-meta">
              <span><strong>Subject:</strong> ${escHtml(a.subject)}</span>
              <span><strong>Teacher:</strong> ${escHtml(teacher)}</span>
              <span><strong>Deadline:</strong> ${formatDeadline(a.deadline)}</span>
            </div>
            ${a.description ? `<div class="assignment-desc">${escHtml(a.description)}</div>` : ""}
          </div>
          <div class="assignment-actions">
            ${statusPill}
            ${countdown ? `<div class="deadline-countdown">${escHtml(countdown)}</div>` : ""}
            ${!submitted
          ? `<button class="btn-success btn-submit-trigger" data-id="${escHtml(a.id)}" data-title="${escHtml(a.title)}">
                   ↑ Submit
                 </button>`
          : `<button class="btn-ghost" style="font-size:0.8rem;padding:7px 14px" disabled>Submitted</button>`
        }
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".btn-submit-trigger").forEach(btn => {
      btn.addEventListener("click", () => openSubmitModal(btn.dataset.id, btn.dataset.title));
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state-sm">Error: ${escHtml(err.message)}</div>`;
  }
}

// SUBMIT ASSIGNMENTS
function openSubmitModal(assignmentId, assignmentTitle) {
  pendingSubmit = { id: assignmentId, title: assignmentTitle };
  $("submit-assignment-title").textContent = assignmentTitle;
  $("submit-file").value = "";
  $("submit-file-selected").textContent = "";
  $("submit-file-err").textContent = "";
  $("submit-general-err").textContent = "";
  $("submit-progress-wrap").classList.add("hidden");
  $("submit-progress-bar").style.width = "0%";
  $("submit-modal").classList.add("open");
}

function closeSubmitModal() {
  $("submit-modal").classList.remove("open");
  pendingSubmit = null;
}
// ASSIGNMENT SUBMISSION
async function submitAssignment() {
  $("submit-file-err").textContent = "";
  $("submit-general-err").textContent = "";

  if (!pendingSubmit) return;

  const fileInput = $("submit-file");
  const file = fileInput.files?.[0];

  if (!file) {
    $("submit-file-err").textContent = "Please select a file to submit.";
    return;
  }

  if (file.size > 1 * 1024 * 1024) {
    $("submit-file-err").textContent = "File must be under 1 MB.";
    return;
  }

  const btn = $("submit-confirm-btn");
  const progressWrap = $("submit-progress-wrap");
  const progressBar = $("submit-progress-bar");
  const progressLbl = $("submit-progress-label");

  setLoading(btn, true, "Submit Assignment");
  progressWrap.classList.remove("hidden");
  progressBar.style.width = "30%";
  progressLbl.textContent = "Uploading file…";

  try {
    await assignments.submit(pendingSubmit.id, file);

    progressBar.style.width = "100%";
    progressLbl.textContent = "Submitted!";

    submittedIds.add(pendingSubmit.id);
    showToast("Assignment submitted successfully!", "success");

    setTimeout(() => {
      closeSubmitModal();
      fetchAssignments($("assignments-search").value);
      fetchDashboardStats();
    }, 700);

  } catch (err) {
    $("submit-general-err").textContent = err.message || "Submission failed. Please try again.";
    progressWrap.classList.add("hidden");
  } finally {
    setLoading(btn, false, "Submit Assignment");
    setTimeout(() => {
      progressWrap.classList.add("hidden");
      progressBar.style.width = "0%";
    }, 1200);
  }
}

// FEE REMINDER
function shouldShowReminder(feeRecord) {
  if (!feeRecord || feeRecord.status === "paid") return false;
  return new Date().getDate() >= 5;
}

async function updateFeeStatCard() {
  try {
    const { fee, showReminder, currentMonth } = await fees.current();

    const card = $("fee-stat-card");
    const badge = $("stat-fee-status");
    const trend = $("stat-fee-trend");
    const iconWrap = $("fee-stat-icon-wrap");

    const status = fee?.status || "unpaid";

    card.classList.remove("fee-paid", "fee-unpaid", "fee-pending");
    badge.classList.remove("paid", "unpaid", "pending");

    if (status === "paid") {
      card.classList.add("fee-paid");
      badge.classList.add("paid");
      badge.textContent = "✓ Paid";
      trend.textContent = "This month";
      trend.className = "stat-trend positive";
      iconWrap.style.setProperty("--accent", "#10b981");
    } else if (status === "pending") {
      card.classList.add("fee-pending");
      badge.classList.add("pending");
      badge.textContent = "⏳ Pending";
      trend.textContent = "Action needed";
      trend.className = "stat-trend neutral";
      iconWrap.style.setProperty("--accent", "#f59e0b");
    } else {
      card.classList.add("fee-unpaid");
      badge.classList.add("unpaid");
      badge.textContent = "✗ Unpaid";
      trend.textContent = "Pay now!";
      trend.className = "stat-trend negative";
      iconWrap.style.setProperty("--accent", "#ef4444");
    }

    // Show global reminder banner if overdue
    const banner = $("fee-reminder-banner");
    if (banner && showReminder) {
      const dayOfMonth = new Date().getDate();
      const daysOver = dayOfMonth - 5;
      $("fee-reminder-title").textContent =
        `⚠️ Fee Not Paid — ${daysOver > 0 ? daysOver + " day" + (daysOver > 1 ? "s" : "") + " overdue" : "Due today"}`;
      $("fee-reminder-text").textContent =
        `Your fee for ${currentMonth} is unpaid. Please pay before the deadline to avoid any academic disruption.`;
      banner.classList.remove("hidden");
    } else if (banner) {
      banner.classList.add("hidden");
    }
  } catch (e) {
    console.warn("Fee stat card error:", e.message);
  }
}

//ATTENDANCE MODULE
const ATT_CIRC_LG = 527.79;
const ATT_CIRC_SM = 201.06;

function attColorClass(pct) {
  if (pct >= 75) return "good";
  if (pct >= 60) return "warning";
  return "danger";
}

function attStrokeColor(cls) {
  return cls === "good" ? "#10b981" : cls === "warning" ? "#f59e0b" : "#ef4444";
}

function animateCounter(el, target, duration = 900) {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * ease);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}
// ATTENDANCE DETAILS
async function fetchAttendance() {
  // Reset UI
  const arc = $("att-ring-arc");
  if (arc) arc.setAttribute("stroke-dashoffset", ATT_CIRC_LG);
  $("att-ring-pct").textContent = "—";
  $("att-ring-footer").innerHTML = `<span>Loading…</span>`;
  $("att-subject-cards").innerHTML = `<div class="empty-state-sm">Loading subjects…</div>`;
  $("att-timeline").innerHTML = `<div class="empty-state-sm">Loading…</div>`;

  ["att-tile-present-num", "att-tile-absent-num", "att-tile-total-num"].forEach(id => {
    const el = $(id);
    if (el) el.textContent = "—";
  });
  if ($("att-alert-tile")) $("att-alert-tile").classList.add("hidden");

  try {
    const data = await attendance.studentOverview();

    if (!data.summary || data.summary.total === 0) {
      renderEmptyAttendance();
      return;
    }

    const { summary, subjects, recent } = data;

    renderAttHeroRing(summary.pct, summary.present, summary.absent, summary.total, subjects.length);
    renderDashMiniRing(summary.pct);
    renderAttSubjectCardsFromAPI(subjects);
    renderAttTimelineFromAPI(recent);

  } catch (err) {
    console.error("Attendance error:", err.message);
    $("att-ring-pct").textContent = "Err";
    $("att-ring-footer").innerHTML = `<span style="color:#ef4444">${escHtml(err.message)}</span>`;
    $("att-subject-cards").innerHTML = `<div class="empty-state-sm" style="color:var(--red)">Error: ${escHtml(err.message)}</div>`;
    $("att-timeline").innerHTML = `<div class="empty-state-sm">Could not load sessions.</div>`;
  }
}

function renderAttHeroRing(pct, present, absent, total, subjectCount) {
  const arc = $("att-ring-arc");
  const pctEl = $("att-ring-pct");
  const footerEl = $("att-ring-footer");
  const glowEl = $("att-ring-glow");
  const cls = attColorClass(pct);
  const color = attStrokeColor(cls);

  const offset = ATT_CIRC_LG - (pct / 100) * ATT_CIRC_LG;
  arc.setAttribute("stroke", color);
  arc.setAttribute("stroke-dashoffset", ATT_CIRC_LG);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.setAttribute("stroke-dashoffset", offset);
  }));

  if (glowEl) {
    glowEl.classList.remove("danger", "warning");
    if (cls !== "good") glowEl.classList.add(cls);
  }

  let displayed = 0;
  const ticker = setInterval(() => {
    displayed = Math.min(displayed + 2, pct);
    pctEl.textContent = `${displayed}%`;
    if (displayed >= pct) clearInterval(ticker);
  }, 18);

  footerEl.innerHTML = `${present} present · ${absent} absent · ${total} total`;

  animateCounter($("att-tile-present-num"), present);
  animateCounter($("att-tile-absent-num"), absent);
  animateCounter($("att-tile-total-num"), total);
  if ($("att-tile-subjects-num")) $("att-tile-subjects-num").textContent = `${subjectCount} subject${subjectCount !== 1 ? "s" : ""}`;

  setTimeout(() => {
    const pBar = $("att-tile-present-bar");
    const aBar = $("att-tile-absent-bar");
    if (pBar) pBar.style.width = total > 0 ? `${Math.round((present / total) * 100)}%` : "0%";
    if (aBar) aBar.style.width = total > 0 ? `${Math.round((absent / total) * 100)}%` : "0%";
  }, 80);

  const alertTile = $("att-alert-tile");
  const alertMsg = $("att-alert-msg");
  if (alertTile && alertMsg) {
    if (pct < 60) {
      alertMsg.textContent = `⚠️ Critical! Attendance ${pct}% is below 60%. Risk of academic disqualification.`;
      alertTile.classList.remove("hidden");
    } else if (pct < 75) {
      alertMsg.textContent = `⚠️ Warning! Attendance ${pct}% is below 75%. You may be barred from exams.`;
      alertTile.classList.remove("hidden");
    } else {
      alertTile.classList.add("hidden");
    }
  }
}

function renderDashMiniRing(pct) {
  const arc = $("dash-att-arc");
  const pctEl = $("dash-att-pct");
  if (!arc || !pctEl) return;

  const cls = attColorClass(pct);
  const color = attStrokeColor(cls);
  const offset = ATT_CIRC_SM - (pct / 100) * ATT_CIRC_SM;

  arc.setAttribute("stroke", color);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arc.setAttribute("stroke-dashoffset", offset);
  }));

  let displayed = 0;
  const ticker = setInterval(() => {
    displayed = Math.min(displayed + 2, pct);
    pctEl.textContent = `${displayed}%`;
    if (displayed >= pct) clearInterval(ticker);
  }, 18);
}

function renderAttSubjectCardsFromAPI(subjects) {
  const container = $("att-subject-cards");
  if (!subjects.length) {
    container.innerHTML = `<div class="empty-state">No subject data found.</div>`;
    return;
  }

  container.innerHTML = subjects.map((s, i) => {
    const cls = attColorClass(s.pct);
    return `
      <div class="att-subject-card" style="animation-delay:${i * 0.07}s">
        <div class="att-subject-card-top">
          <div class="att-subject-name">${escHtml(s.name)}</div>
          <span class="att-subject-pill ${cls}">
            ${cls === "good" ? "✓ Good" : cls === "warning" ? "⚠ Low" : "✗ Critical"}
          </span>
        </div>
        <div class="att-subject-pct-row">
          <div class="att-subject-pct-big ${cls}" data-target="${s.pct}">0%</div>
          <div class="att-subject-fraction">${s.present}/${s.total} classes</div>
        </div>
        <div class="att-subject-bar-track">
          <div class="att-subject-bar-fill ${cls}" data-width="${s.pct}" style="width:0%"></div>
        </div>
        <div class="att-subject-counts">
          <span style="color:var(--green);font-weight:600">${s.present} present</span>
          <span style="color:var(--red);font-weight:600">${s.total - s.present} absent</span>
        </div>
      </div>
    `;
  }).join("");

  setTimeout(() => {
    container.querySelectorAll(".att-subject-bar-fill").forEach(el => {
      el.style.width = el.dataset.width + "%";
    });
    container.querySelectorAll(".att-subject-pct-big").forEach(el => {
      const target = parseInt(el.dataset.target);
      let v = 0;
      const t = setInterval(() => {
        v = Math.min(v + 2, target);
        el.textContent = `${v}%`;
        if (v >= target) clearInterval(t);
      }, 16);
    });
  }, 60);
}

function renderAttTimelineFromAPI(recent) {
  const container = $("att-timeline");
  const countEl = $("att-recent-count");
  if (countEl) countEl.textContent = `Last ${recent.length} classes`;

  if (!recent.length) {
    container.innerHTML = `<div class="empty-state-sm">No recent classes.</div>`;
    return;
  }

  container.innerHTML = recent.map((s, i) => {
    const status = s.status || "absent";
    return `
      <div class="att-timeline-item ${status}" style="animation-delay:${i * 0.04}s">
        <div class="att-timeline-card">
          <div class="att-timeline-left">
            <div class="att-timeline-subject">${escHtml(s.subject)}</div>
            <div class="att-timeline-date">${formatDate(s.date)}</div>
          </div>
          <span class="att-timeline-badge ${status}">${status}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderEmptyAttendance() {
  $("att-ring-pct").textContent = "0%";
  $("att-ring-footer").innerHTML = `<span>No attendance data recorded yet.</span>`;
  $("att-subject-cards").innerHTML = `<div class="empty-state">No subject records found.</div>`;
  $("att-timeline").innerHTML = `<div class="empty-state-sm">No sessions recorded yet.</div>`;
  ["att-tile-present-num", "att-tile-absent-num", "att-tile-total-num"].forEach(id => {
    const el = $(id);
    if (el) el.textContent = "0";
  });
}

async function loadDashAttendancePreview() {
  try {
    const data = await attendance.studentOverview();
    if (data?.summary?.total > 0) {
      renderDashMiniRing(data.summary.pct);
    }
  } catch (e) {
    console.warn("Dashboard attendance preview:", e.message);
  }
}

// FEE PAYMENT API
async function fetchFeePayment() {
  try {
    const { fee, showReminder, currentMonth } = await fees.current();
    renderCurrentFeeCard(fee, currentMonth, new Date());

    const banner = $("fee-reminder-banner");
    if (showReminder) {
      const dayOfMonth = new Date().getDate();
      const daysOver = dayOfMonth - 5;
      $("fee-reminder-title").textContent =
        `Fee Not Paid — ${daysOver > 0 ? daysOver + " day" + (daysOver > 1 ? "s" : "") + " overdue" : "5 days passed"}`;
      $("fee-reminder-text").textContent =
        `Your fee for ${currentMonth} is still unpaid. Please pay immediately.`;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }

    await loadFeeHistory();
  } catch (err) {
    console.error("Fee payment error:", err.message);
  }
}

function renderCurrentFeeCard(feeRow, monthLabel, today) {
  const card = $("fee-current-card");
  const statusBadge = $("fee-status-badge");
  const badgeText = $("fee-badge-text");
  const paidDateEl = $("fee-paid-date");
  const dueRow = $("fee-due-row");

  $("fee-current-month").textContent = monthLabel;

  const status = feeRow?.status || "unpaid";
  const amount = feeRow?.amount ? `₹ ${Number(feeRow.amount).toLocaleString("en-IN")}` : "₹ —";
  $("fee-amount-value").textContent = amount;

  if (feeRow?.due_date) {
    const due = new Date(feeRow.due_date);
    const isLate = due < today && status !== "paid";
    dueRow.textContent = `Due: ${formatDate(feeRow.due_date)}${isLate ? " — OVERDUE" : ""}`;
    dueRow.className = `fee-due-row${isLate ? " overdue" : ""}`;
  } else {
    dueRow.textContent = `Due: 5th of every month`;
    dueRow.className = "fee-due-row";
  }

  card.classList.remove("fee-paid", "fee-unpaid", "fee-pending");
  statusBadge.classList.remove("paid", "unpaid", "pending");
  paidDateEl.classList.add("hidden");

  if (status === "paid") {
    card.classList.add("fee-paid");
    statusBadge.classList.add("paid");
    badgeText.textContent = "✓ PAID";
    if (feeRow?.paid_at) {
      paidDateEl.textContent = `Paid on ${formatDate(feeRow.paid_at)}`;
      paidDateEl.classList.remove("hidden");
    }
  } else if (status === "pending") {
    card.classList.add("fee-pending");
    statusBadge.classList.add("pending");
    badgeText.textContent = "⏳ PENDING";
  } else {
    card.classList.add("fee-unpaid");
    statusBadge.classList.add("unpaid");
    badgeText.textContent = "✗ UNPAID";
  }
}

async function loadFeeHistory() {
  const tbody = $("fee-history-tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Loading…</td></tr>`;

  try {
    const { history, count } = await fees.history();
    allFeeRecords = history || [];
    $("fee-history-count").textContent = `${allFeeRecords.length} record${allFeeRecords.length !== 1 ? "s" : ""}`;

    if (!allFeeRecords.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No fee records found yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = allFeeRecords.map(r => {
      const status = r.status || "unpaid";
      const pillCls = status === "paid" ? "fee-pill-paid"
        : status === "pending" ? "fee-pill-pending"
          : "fee-pill-unpaid";
      const pillIcon = status === "paid" ? "✓" : status === "pending" ? "⏳" : "✗";
      const amount = r.amount ? `₹ ${Number(r.amount).toLocaleString("en-IN")}` : "—";
      const [yr, mo] = (r.month || "").split("-");
      const mLabel = yr && mo
        ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
        : r.month || "—";

      return `
        <tr>
          <td><strong>${escHtml(mLabel)}</strong></td>
          <td>${escHtml(amount)}</td>
          <td><span class="pill ${pillCls}">${pillIcon} ${escHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span></td>
          <td>${r.due_date ? formatDate(r.due_date) : "5th of month"}</td>
          <td>${r.paid_at ? formatDate(r.paid_at) : "—"}</td>
          <td>
            ${r.receipt_url
          ? `<a class="fee-receipt-link" href="${escHtml(r.receipt_url)}" target="_blank" rel="noopener">📄 Receipt</a>`
          : `<span style="color:var(--text-muted);font-size:0.8rem">—</span>`
        }
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

// ANNOUNCEMENTS
async function fetchAnnouncements() {
  const feed = $("announcements-feed");
  feed.innerHTML = `<div class="empty-state-sm">Loading…</div>`;

  try {
    const { announcements: data } = await announcements.list();

    if (!data?.length) {
      feed.innerHTML = `<div class="empty-state-sm">No announcements yet.</div>`;
      return;
    }

    feed.innerHTML = data.map(a => {
      const teacher = a.users?.full_name
        || `${a.users?.first_name || ""} ${a.users?.last_name || ""}`.trim()
        || "Teacher";
      return `
        <div class="announcement-card">
          <div class="announcement-header">
            <div class="announcement-title">${escHtml(a.title)}</div>
            <div class="announcement-date">${formatDate(a.created_at)}</div>
          </div>
          <div class="announcement-teacher">📢 ${escHtml(teacher)}</div>
          <div class="announcement-message">${escHtml(a.message)}</div>
        </div>
      `;
    }).join("");
  } catch (err) {
    feed.innerHTML = `<div class="empty-state-sm">Error: ${escHtml(err.message)}</div>`;
  }
}

// ACTIVITY CHART
async function loadActivityChart() {
  if (chartInitialised) return;
  chartInitialised = true;

  try {
    const data = await analytics.student();

    new Chart($("chart-activity").getContext("2d"), {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Downloads",
            data: data.downloads,
            backgroundColor: "rgba(16,185,129,0.7)",
            borderRadius: 6,
            borderSkipped: false,
          },
          {
            label: "Submissions",
            data: data.submissions,
            backgroundColor: "rgba(79,70,229,0.65)",
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { font: { size: 12 }, padding: 16, usePointStyle: true },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { precision: 0, font: { size: 11 } } },
        },
      },
    });
  } catch (err) {
    console.warn("Chart error:", err.message);
  }
}

// PROFILE SAVE
async function saveProfile() {
  $("profile-err").textContent = "";
  $("profile-success").classList.add("hidden");

  const firstName = $("profile-firstname").value.trim();
  const lastName = $("profile-lastname").value.trim();
  const course = $("profile-course").value.trim();
  const bio = $("profile-bio").value.trim();

  const btn = $("profile-save-btn");
  setLoading(btn, true, "Save Changes");

  try {
    await users.updateProfile({ first_name: firstName, last_name: lastName, course, bio });

    Object.assign(studentProfile, { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`.trim(), course, bio });
    applyProfileToUI();

    $("profile-success").textContent = "Profile updated successfully!";
    $("profile-success").classList.remove("hidden");
    showToast("Profile saved!", "success");

  } catch (err) {
    $("profile-err").textContent = err.message || "Failed to save profile.";
  } finally {
    setLoading(btn, false, "Save Changes");
  }
}

// LOGOUT
function logoutStudent() {
  auth.logout();
}

// NAVIGATION
function navigateTo(section) {
  $$(".section").forEach(s => s.classList.remove("active"));
  const el = $(`section-${section}`);
  if (el) el.classList.add("active");

  $$(".nav-item").forEach(n => n.classList.remove("active"));
  $$(`[data-section="${section}"]`).forEach(n => n.classList.add("active"));

  if (section === "courses") fetchCourses();
  if (section === "notes") fetchNotes();
  if (section === "assignments") fetchAssignments();
  if (section === "attendance") fetchAttendance();
  if (section === "fee-payment") fetchFeePayment();
  if (section === "announcements") fetchAnnouncements();
  if (section === "dashboard") loadActivityChart();

  if (window.innerWidth <= 768) $("sidebar").classList.remove("open");
  document.querySelector(".main-content").scrollTop = 0;
}

// FILE DROP INIT
function initSubmitFileDrop() {
  const zone = $("submit-drop-zone");
  const input = $("submit-file");
  if (!zone || !input) return;

  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
      $("submit-file-selected").textContent =
        `📎 ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`;
    }
  });

  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) $("submit-file-selected").textContent =
      `📎 ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`;
  });
}

// GLOBAL SEARCH
function setupGlobalSearch() {
  const input = $("global-search");
  if (!input) return; // Search bar removed from UI
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.trim();
      if (!q) return;
      navigateTo("notes");
      fetchNotes(q);
    }, 400);
  });
}

// EVENT WIRING
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
        setTimeout(() => {
          attRefreshBtn.style.pointerEvents = "";
          attRefreshBtn.querySelector("svg").style.transform = "";
        }, 800);
      });
    });
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-section]");
    if (link && !link.classList.contains("nav-item")) {
      navigateTo(link.dataset.section);
    }
  });

  $("topnav-logout").addEventListener("click", logoutStudent);

  $("sidebar-toggle").addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      $("sidebar").classList.toggle("open");
    } else {
      document.body.classList.toggle("sidebar-collapsed");
    }
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
  $("submit-cancel-btn").addEventListener("click", closeSubmitModal);
  $("submit-modal-close").addEventListener("click", closeSubmitModal);
  $("submit-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeSubmitModal();
  });

  $("profile-save-btn").addEventListener("click", saveProfile);

  initSubmitFileDrop();
  setupGlobalSearch();
}

// INIT EVENT
document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  boot();
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
