/**
 * teacher-dashboard.js
 * DigitalStudyCenter — Teacher Dashboard
 * Uses backend API via api.js instead of direct Supabase calls.
 */

import {
  auth, notes, assignments, users, attendance,
  analytics, getUser, setUser,
} from "./api.js";

/* ═══════════════════════════════════════════════════════
   MODULE STATE
═══════════════════════════════════════════════════════ */
let currentTeacher    = null;
let teacherProfile    = null;
let allNotes          = [];
let allAssignments    = [];
let allStudents       = [];
let deleteCallback    = null;
let chartsInitialised = false;

/* ═══════════════════════════════════════════════════════
   DOM HELPERS
═══════════════════════════════════════════════════════ */
const $  = (id)  => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(message, type = "info") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className   = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = "toast"; }, 3500);
}

function setLoading(btnEl, loading, idleHtml = "Submit") {
  if (!btnEl) return;
  btnEl.disabled  = loading;
  btnEl.innerHTML = loading ? `<span class="spinner"></span>Please wait…` : idleHtml;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDeadline(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function deadlinePill(iso) {
  if (!iso) return `<span class="pill pill-gray">No deadline</span>`;
  const diff = new Date(iso) - new Date();
  if (diff < 0)         return `<span class="pill pill-red">Overdue</span>`;
  if (diff < 86400000)  return `<span class="pill pill-amber">Due today</span>`;
  return `<span class="pill pill-green">Upcoming</span>`;
}

function initials(name) {
  if (!name) return "T";
  return name.split(" ").map(p => p[0]?.toUpperCase() || "").filter(Boolean).slice(0, 2).join("");
}

function escHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ═══════════════════════════════════════════════════════
   BOOT — AUTH GUARD
═══════════════════════════════════════════════════════ */
async function boot() {
  try {
    const data = await auth.checkSession();
    currentTeacher = data.user;
    teacherProfile = data.user;

    // Role guard
    if (teacherProfile.role && teacherProfile.role !== "teacher") {
      window.location.href = "student-portal.html";
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

function applyProfileToUI() {
  const name = teacherProfile?.full_name
    || `${teacherProfile?.first_name || ""} ${teacherProfile?.last_name || ""}`.trim()
    || teacherProfile?.email || "Teacher";

  const short = name.split(" ")[0] || "Teacher";
  const ini   = initials(name);

  $("sb-name").textContent            = name;
  $("sb-avatar").textContent          = ini;
  $("topnav-name").textContent        = short;
  $("topnav-avatar").textContent      = ini;
  $("welcome-name").textContent       = short;
  $("profile-display-name").textContent  = name;
  $("profile-display-email").textContent = teacherProfile?.email || "";
  $("profile-avatar-big").textContent    = ini;
  $("profile-email").value               = teacherProfile?.email || "";
  $("profile-firstname").value           = teacherProfile?.first_name || "";
  $("profile-lastname").value            = teacherProfile?.last_name  || "";
  $("profile-subject").value             = teacherProfile?.subject    || "";
  $("profile-bio").value                 = teacherProfile?.bio        || "";
}

function showApp() {
  $("auth-guard").classList.add("hidden");
  $("app-shell").classList.add("visible");
}

/* ═══════════════════════════════════════════════════════
   FETCH DASHBOARD STATS
═══════════════════════════════════════════════════════ */
async function fetchDashboardStats() {
  try {
    const { stats } = await users.getDashboardStats();

    $("stat-students").textContent    = stats.students ?? "—";
    $("stat-notes").textContent       = stats.notes ?? "—";
    $("stat-assignments").textContent = stats.assignments ?? "—";
    $("stat-courses").textContent     = stats.courses ?? "0";

  } catch (err) {
    console.warn("Stats fetch error:", err.message);
  }

  await Promise.all([loadRecentNotes(), loadRecentAssignments()]);
}

async function loadRecentNotes() {
  try {
    const { notes: data } = await notes.teacherNotes();
    const recent = (data || []).slice(0, 5);
    const el = $("recent-notes-list");
    if (!recent.length) {
      el.innerHTML = `<div class="empty-state-sm">No notes uploaded yet.</div>`;
      return;
    }
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
  } catch (e) {
    $("recent-notes-list").innerHTML = `<div class="empty-state-sm">Could not load notes.</div>`;
  }
}

async function loadRecentAssignments() {
  try {
    const { assignments: data } = await assignments.teacherAssignments();
    const recent = (data || []).slice(0, 5);
    const el = $("recent-assignments-list");
    if (!recent.length) {
      el.innerHTML = `<div class="empty-state-sm">No assignments posted yet.</div>`;
      return;
    }
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
        </div>
      `;
    }).join("");
  } catch (e) {
    $("recent-assignments-list").innerHTML = `<div class="empty-state-sm">Could not load assignments.</div>`;
  }
}

/* ═══════════════════════════════════════════════════════
   UPLOAD NOTES
═══════════════════════════════════════════════════════ */
async function uploadNotes() {
  ["note-title-err","note-subject-err","note-file-err","upload-general-err"]
    .forEach(id => { $(id).textContent = ""; });

  const title       = $("note-title").value.trim();
  const subject     = $("note-subject").value.trim();
  const course      = $("note-course").value.trim();
  const description = $("note-description").value.trim();
  const fileInput   = $("note-file");
  const file        = fileInput.files?.[0];

  let valid = true;
  if (!title)   { $("note-title-err").textContent   = "Title is required.";   valid = false; }
  if (!subject) { $("note-subject-err").textContent = "Subject is required."; valid = false; }
  if (!file) {
    $("note-file-err").textContent = "Please select a PDF file."; valid = false;
  } else if (file.type !== "application/pdf") {
    $("note-file-err").textContent = "Only PDF files are accepted."; valid = false;
  } else if (file.size > 1 * 1024 * 1024) {
    $("note-file-err").textContent = "File must be under 1 MB."; valid = false;
  }
  if (!valid) return;

  const btn           = $("upload-notes-btn");
  const progressWrap  = $("upload-progress-wrap");
  const progressBar   = $("upload-progress-bar");
  const progressLabel = $("upload-progress-label");

  setLoading(btn, true, "Upload Notes");
  progressWrap.classList.remove("hidden");
  progressBar.style.width    = "20%";
  progressLabel.textContent  = "Uploading file to server…";

  try {
    await notes.upload(title, subject, course, description, file);

    progressBar.style.width   = "100%";
    progressLabel.textContent = "Done!";

    showToast("Notes uploaded successfully!", "success");
    resetUploadForm();
    await fetchDashboardStats();
    setTimeout(() => navigateTo("my-notes"), 900);

  } catch (err) {
    $("upload-general-err").textContent = err.message || "Upload failed. Please try again.";
    progressWrap.classList.add("hidden");
  } finally {
    setLoading(btn, false, "Upload Notes");
    setTimeout(() => {
      progressWrap.classList.add("hidden");
      progressBar.style.width = "0%";
    }, 1400);
  }
}

function resetUploadForm() {
  ["note-title","note-subject","note-course","note-description"].forEach(id => { $(id).value = ""; });
  $("note-file").value           = "";
  $("file-selected").textContent = "";
}

function initFileDrop() {
  const zone  = $("file-drop-zone");
  const input = $("note-file");
  if (!zone || !input) return;

  zone.addEventListener("dragover",  (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
      updateFileLabel(f);
    }
  });

  input.addEventListener("change", () => {
    if (input.files?.[0]) updateFileLabel(input.files[0]);
  });
}

function updateFileLabel(file) {
  $("file-selected").textContent =
    `📎 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
}

/* ═══════════════════════════════════════════════════════
   LOAD NOTES TABLE
═══════════════════════════════════════════════════════ */
async function loadNotesTable(query = "") {
  const tbody = $("notes-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Loading…</td></tr>`;

  try {
    const { notes: data } = await notes.teacherNotes(query);
    allNotes = data || [];

    if (!allNotes.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No notes found. Upload your first note!</td></tr>`;
      return;
    }

    tbody.innerHTML = allNotes.map(n => `
      <tr>
        <td>
          <strong>${escHtml(n.title)}</strong>
          ${n.course ? `<br><span style="font-size:0.78rem;color:var(--text-muted)">${escHtml(n.course)}</span>` : ""}
        </td>
        <td>${escHtml(n.subject)}</td>
        <td>${formatDate(n.created_at)}</td>
        <td><span class="pill pill-blue">${n.download_count ?? 0}</span></td>
        <td>
          <a href="${escHtml(n.file_url)}" target="_blank" class="btn-icon" title="View PDF">📄 View</a>
          <button class="btn-icon delete"
            data-delete-note="${escHtml(n.id)}"
            data-name="${escHtml(n.title)}"
            title="Delete">🗑</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-delete-note]").forEach(btn => {
      btn.addEventListener("click", () =>
        openDeleteModal(btn.dataset.name, () => deleteNote(btn.dataset.deleteNote))
      );
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

async function deleteNote(id) {
  try {
    await notes.remove(id);
    showToast("Note deleted.", "success");
    await loadNotesTable($("notes-search").value);
    await fetchDashboardStats();
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

/* ═══════════════════════════════════════════════════════
   CREATE ASSIGNMENT
═══════════════════════════════════════════════════════ */
async function createAssignment() {
  ["assign-title-err","assign-subject-err","assign-deadline-err","assign-general-err"]
    .forEach(id => { $(id).textContent = ""; });

  const title       = $("assign-title").value.trim();
  const subject     = $("assign-subject").value.trim();
  const description = $("assign-description").value.trim();
  const deadline    = $("assign-deadline").value;

  let valid = true;
  if (!title)    { $("assign-title-err").textContent    = "Title is required.";    valid = false; }
  if (!subject)  { $("assign-subject-err").textContent  = "Subject is required.";  valid = false; }
  if (!deadline) { $("assign-deadline-err").textContent = "Deadline is required."; valid = false; }
  if (!valid) return;

  const btn = $("create-assignment-btn");
  setLoading(btn, true, "Create Assignment");

  try {
    await assignments.create(title, subject, description, new Date(deadline).toISOString());

    showToast("Assignment created!", "success");
    ["assign-title","assign-subject","assign-description","assign-deadline"]
      .forEach(id => { $(id).value = ""; });
    await loadAssignmentsTable();
    await fetchDashboardStats();

  } catch (err) {
    $("assign-general-err").textContent = err.message || "Failed to create assignment.";
  } finally {
    setLoading(btn, false, "Create Assignment");
  }
}

/* ═══════════════════════════════════════════════════════
   LOAD ASSIGNMENTS TABLE
═══════════════════════════════════════════════════════ */
async function loadAssignmentsTable() {
  const tbody = $("assignments-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Loading…</td></tr>`;

  try {
    const { assignments: data } = await assignments.teacherAssignments();
    allAssignments = data || [];

    if (!allAssignments.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No assignments yet. Create your first one!</td></tr>`;
      return;
    }

    tbody.innerHTML = allAssignments.map(a => `
      <tr>
        <td><strong>${escHtml(a.title)}</strong></td>
        <td>${escHtml(a.subject)}</td>
        <td>${formatDeadline(a.deadline)}</td>
        <td>${deadlinePill(a.deadline)}</td>
        <td>
          <button class="btn-icon delete"
            data-delete-assign="${escHtml(a.id)}"
            data-name="${escHtml(a.title)}"
            title="Delete">🗑</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-delete-assign]").forEach(btn => {
      btn.addEventListener("click", () =>
        openDeleteModal(btn.dataset.name, () => deleteAssignment(btn.dataset.deleteAssign))
      );
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

async function deleteAssignment(id) {
  try {
    await assignments.remove(id);
    showToast("Assignment deleted.", "success");
    await loadAssignmentsTable();
    await fetchDashboardStats();
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

/* ═══════════════════════════════════════════════════════
   FETCH STUDENTS
═══════════════════════════════════════════════════════ */
async function fetchStudents(query = "") {
  const tbody = $("students-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;

  try {
    const { students: data } = await users.listStudents(query);
    allStudents = data || [];
    $("students-count").textContent =
      `${allStudents.length} student${allStudents.length !== 1 ? "s" : ""}`;

    if (!allStudents.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No students found. Add your first student!</td></tr>`;
      return;
    }

    tbody.innerHTML = allStudents.map(s => {
      const name      = s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || "—";
      const ini       = initials(name);
      const lastAct   = s.last_activity ? formatDate(s.last_activity) : "Never";
      const isActive  = s.is_active !== undefined
        ? s.is_active
        : (s.last_activity && (new Date() - new Date(s.last_activity)) < 7 * 86400000);

      const feesPaid  = s.fees_status === "paid";
      const feesLabel = feesPaid ? "Paid" : (s.fees_status || "Unpaid");
      const feesCls   = feesPaid ? "pill-green" : "pill-amber";
      const feesBtnLabel = feesPaid ? "Mark Unpaid" : "Mark Paid";
      const feesAction   = feesPaid ? "unpaid" : "paid";

      return `
        <tr class="${!isActive ? 'student-row-inactive' : ''}">
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-weight:700;font-size:0.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0">${escHtml(ini)}</div>
              <span>${escHtml(name)}</span>
            </div>
          </td>
          <td>${escHtml(s.email)}</td>
          <td>${escHtml(s.course || "—")}</td>
          <td>${lastAct}</td>
          <td><span class="pill ${feesCls}">${escHtml(feesLabel)}</span></td>
          <td><span class="pill ${isActive ? "pill-green" : "pill-red"}">${isActive ? "Active" : "Inactive"}</span></td>
          <td style="white-space:nowrap">
            <button class="btn-icon fees-toggle-btn"
              data-student-id="${escHtml(s.id)}"
              data-student-name="${escHtml(name)}"
              data-fees-action="${feesAction}"
              title="${feesBtnLabel}">
              ${feesPaid ? "💸 Mark Unpaid" : "✅ Mark Paid"}
            </button>
            <button class="btn-icon ${isActive ? "deactivate-btn" : "activate-btn"}"
              data-student-id="${escHtml(s.id)}"
              data-student-name="${escHtml(name)}"
              data-is-active="${isActive ? "true" : "false"}"
              title="${isActive ? "Deactivate" : "Activate"}">
              ${isActive ? "🚫 Deactivate" : "✅ Activate"}
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Wire fees toggle buttons
    tbody.querySelectorAll(".fees-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () =>
        updateFeesStatus(btn.dataset.studentId, btn.dataset.studentName, btn.dataset.feesAction)
      );
    });

    // Wire activate/deactivate buttons
    tbody.querySelectorAll(".deactivate-btn, .activate-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const newActive = btn.dataset.isActive === "false";
        try {
          await users.updateStudentStatus(btn.dataset.studentId, newActive);
          showToast(`${btn.dataset.studentName} ${newActive ? "activated" : "deactivated"}.`, "success");
          await fetchStudents($("students-search").value);
        } catch (err) {
          showToast("Update failed: " + err.message, "error");
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

/* ═══════════════════════════════════════════════════════
   ANALYTICS
═══════════════════════════════════════════════════════ */
async function loadAnalytics() {
  if (chartsInitialised) return;
  chartsInitialised = true;

  try {
    const data = await analytics.teacher();

    const PALETTE = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
    const baseOpts = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    };

    // Line — Downloads
    new Chart($("chart-downloads").getContext("2d"), {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [{
          label: "Downloads", data: data.downloads,
          borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,0.08)",
          borderWidth: 2.5, pointBackgroundColor: "#4f46e5", pointRadius: 4,
          fill: true, tension: 0.4,
        }],
      },
      options: {
        ...baseOpts,
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 11 } } },
        },
      },
    });

    // Bar — Student Activity
    new Chart($("chart-activity").getContext("2d"), {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [{
          label: "New Students", data: data.studentActivity,
          backgroundColor: "rgba(16,185,129,0.75)", borderRadius: 6, borderSkipped: false,
        }],
      },
      options: {
        ...baseOpts,
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { precision: 0, font: { size: 11 } } },
        },
      },
    });

    // Doughnut — Submissions by Subject
    new Chart($("chart-submissions").getContext("2d"), {
      type: "doughnut",
      data: {
        labels: data.subjectLabels.length ? data.subjectLabels : ["No data"],
        datasets: [{
          data: data.subjectValues.length ? data.subjectValues : [1],
          backgroundColor: data.subjectValues.length ? PALETTE.slice(0, data.subjectLabels.length) : ["#e2e8f0"],
          borderWidth: 2, borderColor: "#fff", hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "65%",
        plugins: {
          legend: { display: true, position: "bottom", labels: { font: { size: 11 }, padding: 14 } },
        },
      },
    });
  } catch (err) {
    console.warn("Analytics error:", err.message);
  }
}

/* ═══════════════════════════════════════════════════════
   SAVE PROFILE
═══════════════════════════════════════════════════════ */
async function saveProfile() {
  $("profile-err").textContent = "";
  $("profile-success").classList.add("hidden");

  const firstName = $("profile-firstname").value.trim();
  const lastName  = $("profile-lastname").value.trim();
  const subject   = $("profile-subject").value.trim();
  const bio       = $("profile-bio").value.trim();

  const btn = $("profile-save-btn");
  setLoading(btn, true, "Save Changes");

  try {
    await users.updateProfile({ first_name: firstName, last_name: lastName, subject, bio });

    Object.assign(teacherProfile, {
      first_name: firstName, last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(), subject, bio,
    });

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

/* ═══════════════════════════════════════════════════════
   LOGOUT
═══════════════════════════════════════════════════════ */
function logoutTeacher() {
  auth.logout();
}

/* ═══════════════════════════════════════════════════════
   DELETE MODAL
═══════════════════════════════════════════════════════ */
function openDeleteModal(name, callback) {
  $("delete-item-name").textContent = name;
  deleteCallback = callback;
  $("delete-modal").classList.add("open");
}

function closeDeleteModal() {
  $("delete-modal").classList.remove("open");
  deleteCallback = null;
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════ */
const SECTION_TITLES = {
  "dashboard":     "Dashboard",
  "upload-notes":  "Upload Notes",
  "my-notes":      "My Notes",
  "assignments":   "Assignments",
  "students":      "Students",
  "analytics":     "Analytics",
  "attendance":    "Attendance",
  "profile":       "Profile",
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
  if (section === "analytics")   loadAnalytics();
  if (section === "attendance")  { loadAttendanceHistory(); setDefaultAttDate(); }

  if (window.innerWidth <= 768) $("sidebar").classList.remove("open");
  document.querySelector(".main-content").scrollTop = 0;
}

/* ═══════════════════════════════════════════════════════
   EVENT WIRING
═══════════════════════════════════════════════════════ */
function wireEvents() {
  $$(".nav-item[data-section]").forEach(item =>
    item.addEventListener("click", () => navigateTo(item.dataset.section))
  );

  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-section]");
    if (link && !link.classList.contains("nav-item")) {
      navigateTo(link.dataset.section);
    }
  });

  $("topnav-logout").addEventListener("click",  logoutTeacher);

  $("sidebar-toggle").addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      $("sidebar").classList.toggle("open");
    } else {
      document.body.classList.toggle("sidebar-collapsed");
    }
  });

  $("sidebar-inner-collapse").addEventListener("click", () => {
    if (window.innerWidth <= 768) return;
    const sidebar   = $("sidebar");
    const mainWrap  = document.querySelector(".main-wrap");
    const isNowCollapsed = sidebar.classList.toggle("sidebar-icon-only");
    mainWrap.style.marginLeft = isNowCollapsed
      ? "var(--sidebar-w-collapsed)"
      : "var(--sidebar-w)";
  });

  $("upload-notes-btn").addEventListener("click", uploadNotes);
  $("upload-reset-btn").addEventListener("click",  resetUploadForm);

  $("create-assignment-btn").addEventListener("click", createAssignment);

  let notesTimer;
  $("notes-search").addEventListener("input", () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => loadNotesTable($("notes-search").value), 350);
  });

  let studentsTimer;
  $("students-search").addEventListener("input", () => {
    clearTimeout(studentsTimer);
    studentsTimer = setTimeout(() => fetchStudents($("students-search").value), 350);
  });

  $("delete-confirm-btn").addEventListener("click", async () => {
    if (deleteCallback) {
      $("delete-confirm-btn").disabled = true;
      await deleteCallback();
      $("delete-confirm-btn").disabled = false;
    }
    closeDeleteModal();
  });
  $("delete-cancel-btn").addEventListener("click",  closeDeleteModal);
  $("delete-modal-close").addEventListener("click", closeDeleteModal);
  $("delete-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });

  $("profile-save-btn").addEventListener("click", saveProfile);

  // Attendance
  $("att-load-btn").addEventListener("click", loadStudentsForAttendance);
  $("att-save-btn").addEventListener("click", saveAttendance);
  $("att-refresh-history").addEventListener("click", loadAttendanceHistory);

  $("att-class").addEventListener("change", () => {
    loadSubjectsForClass($("att-class").value);
  });

  $("att-mark-all-present").addEventListener("click", () => markAll("present"));
  $("att-mark-all-absent").addEventListener("click",  () => markAll("absent"));
  $("att-check-all").addEventListener("change", (e) => toggleSelectAll(e.target.checked));
  $("att-detail-close").addEventListener("click",     closeAttDetailModal);
  $("att-detail-close-btn").addEventListener("click", closeAttDetailModal);
  $("att-detail-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeAttDetailModal();
  });

  // Add Student modal
  $("btn-add-student").addEventListener("click", openAddStudentModal);
  $("add-student-modal-close").addEventListener("click", closeAddStudentModal);
  $("add-student-cancel-btn").addEventListener("click", closeAddStudentModal);
  $("add-student-btn").addEventListener("click", addStudent);
  $("add-student-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeAddStudentModal();
  });

  // Fees auto-mark
  $("btn-auto-mark-inactive").addEventListener("click", autoMarkInactiveUnpaid);

  initFileDrop();
}

/* ═══════════════════════════════════════════════════════
   ATTENDANCE MODULE
═══════════════════════════════════════════════════════ */

let attStudents = [];
let attStatusMap = {};
let attNoteMap = {};
let attSessionId = null;
let viewingSessionId = null;

async function loadSubjectsForClass(attClass) {
  const select = $("att-subject");
  if (!attClass) {
    select.innerHTML = `<option value="">Select Subject</option>`;
    return;
  }
  // Keep original behavior — subjects loaded from a subjects table
  // This is a local operation that still needs the subjects data
  // For now, we keep a simple approach
  select.innerHTML = `<option value="">Select Subject</option>`;
}

function setDefaultAttDate() {
  const el = $("att-date");
  if (el && !el.value) {
    el.value = new Date().toISOString().slice(0, 10);
  }
}

async function loadStudentsForAttendance() {
  const date = $("att-date").value;
  const attClass = $("att-class").value;
  const subjectVal = $("att-subject").value;

  $("att-err").textContent = "";

  if (!date) { $("att-err").textContent = "Select date."; return; }
  if (!attClass) { $("att-err").textContent = "Select class."; return; }
  if (!subjectVal) { $("att-err").textContent = "Select subject."; return; }

  const btn = $("att-load-btn");
  setLoading(btn, true, "Load Students");

  try {
    const { students } = await attendance.getStudentsForClass();

    attStudents = students || [];
    attStatusMap = {};
    attNoteMap = {};

    attStudents.forEach(s => {
      attStatusMap[s.id] = "present";
    });

    renderAttTable();
    updateAttSummary();
  } catch (err) {
    $("att-err").textContent = err.message;
  } finally {
    setLoading(btn, false, "Load Students");
  }
}

function renderAttTable() {
  const tbody = $("att-tbody");

  if (!attStudents.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No students</td></tr>`;
    return;
  }

  tbody.innerHTML = attStudents.map(s => {
    const name = s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim();
    const ini = initials(name);
    const status = attStatusMap[s.id];

    const rowClass =
      status === "present" ? "att-row-present"
      : status === "absent" ? "att-row-absent"
      : "";

    return `
      <tr id="att-row-${s.id}" class="${rowClass}">
        <td><input type="checkbox" class="att-row-check" data-sid="${s.id}"></td>
        <td>
          <div class="att-student-cell">
            <div class="att-avatar-mini">${ini}</div>
            <span>${escHtml(name)}</span>
          </div>
        </td>
        <td>${escHtml(s.email)}</td>
        <td>${escHtml(s.course || "—")}</td>
        <td>
          <button class="att-status-btn ${status === "present" ? "active" : ""}" data-sid="${s.id}" data-status="present">Present</button>
          <button class="att-status-btn ${status === "absent" ? "active" : ""}" data-sid="${s.id}" data-status="absent">Absent</button>
        </td>
        <td>
          <input class="att-note-input" data-sid="${s.id}" value="${escHtml(attNoteMap[s.id] || "")}">
        </td>
      </tr>`;
  }).join("");

  tbody.querySelectorAll(".att-status-btn").forEach(btn => {
    btn.onclick = () => {
      setStudentStatus(btn.dataset.sid, btn.dataset.status);
    };
  });

  tbody.querySelectorAll(".att-note-input").forEach(input => {
    input.oninput = () => {
      attNoteMap[input.dataset.sid] = input.value;
    };
  });
}

function setStudentStatus(sid, status) {
  attStatusMap[sid] = status;
  renderAttTable();
  updateAttSummary();
}

function markAll(status) {
  attStudents.forEach(s => {
    attStatusMap[s.id] = status;
  });
  renderAttTable();
  updateAttSummary();
}

function toggleSelectAll(checked) {
  document.querySelectorAll(".att-row-check").forEach(cb => {
    cb.checked = checked;
  });
}

function updateAttSummary() {
  const total = attStudents.length;
  const present = Object.values(attStatusMap).filter(v => v === "present").length;
  const absent = Object.values(attStatusMap).filter(v => v === "absent").length;

  $("att-present-num").textContent = present;
  $("att-absent-num").textContent = absent;
  $("att-total-num").textContent = total;

  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  $("att-bar-present").style.width = pct + "%";
  $("att-bar-absent").style.width = (100 - pct) + "%";
}

async function saveAttendance() {
  const date = $("att-date").value;
  const attClass = $("att-class").value;
  const subjectVal = $("att-subject").value;

  if (!date || !attClass || !subjectVal) return;

  const btn = $("att-save-btn");
  setLoading(btn, true, "Saving");

  try {
    const records = attStudents.map(s => ({
      student_id: s.id,
      status: attStatusMap[s.id],
      note: attNoteMap[s.id] || null,
    }));

    await attendance.saveSession({
      date,
      class_name: attClass,
      subject: subjectVal,
      records,
    });

    showToast("Attendance saved", "success");
    loadAttendanceHistory();
  } catch (err) {
    showToast("Save failed: " + err.message, "error");
  } finally {
    setLoading(btn, false, "Save Attendance");
  }
}

function closeAttDetailModal() {
  $("att-detail-modal").classList.remove("open");
  viewingSessionId = null;
}

async function openAttDetailModal(sessionId, sessionDate, subjectName) {
  viewingSessionId = sessionId;
  $("att-detail-title").textContent = `Attendance — ${sessionDate}`;
  $("att-detail-sub").textContent = `Subject: ${subjectName}`;
  $("att-detail-modal").classList.add("open");
  $("att-detail-tbody").innerHTML = `<tr><td colspan="4" class="table-empty">Loading…</td></tr>`;

  try {
    const { records } = await attendance.getSessionRecords(sessionId);

    if (!records?.length) {
      $("att-detail-tbody").innerHTML = `<tr><td colspan="4" class="table-empty">No records found.</td></tr>`;
      return;
    }

    $("att-detail-tbody").innerHTML = records.map(r => {
      const u = r.users || {};
      const name = u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
      const statusCls = r.status === "present" ? "pill-green" : "pill-red";
      return `
        <tr>
          <td>${escHtml(name)}</td>
          <td>${escHtml(u.email || "—")}</td>
          <td><span class="pill ${statusCls}">${escHtml(r.status)}</span></td>
          <td>${escHtml(r.note || "—")}</td>
        </tr>`;
    }).join("");

    // Wire delete button
    $("att-detail-delete-btn").onclick = async () => {
      if (!confirm("Delete this entire attendance session?")) return;
      try {
        await attendance.deleteSession(sessionId);
        closeAttDetailModal();
        showToast("Session deleted.", "success");
        loadAttendanceHistory();
      } catch (err) {
        showToast("Delete failed: " + err.message, "error");
      }
    };
  } catch (err) {
    $("att-detail-tbody").innerHTML = `<tr><td colspan="4" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

/* ═══════════════════════════════════════════════════════
   ADD STUDENT MODAL
═══════════════════════════════════════════════════════ */
function openAddStudentModal() {
  ["add-student-name-err","add-student-email-err","add-student-pass-err","add-student-general-err"]
    .forEach(id => { const el = $(id); if (el) el.textContent = ""; });
  ["add-student-firstname","add-student-lastname","add-student-email","add-student-course","add-student-password"]
    .forEach(id => { const el = $(id); if (el) el.value = ""; });
  $("add-student-modal").classList.add("open");
}

function closeAddStudentModal() {
  $("add-student-modal").classList.remove("open");
}

async function addStudent() {
  ["add-student-name-err","add-student-email-err","add-student-pass-err","add-student-general-err"]
    .forEach(id => { const el = $(id); if (el) el.textContent = ""; });

  const firstName = $("add-student-firstname").value.trim();
  const lastName  = $("add-student-lastname").value.trim();
  const email     = $("add-student-email").value.trim();
  const course    = $("add-student-course").value.trim();
  const password  = $("add-student-password").value;

  let valid = true;
  if (!firstName || !lastName) {
    $("add-student-name-err").textContent = "First and last name are required.";
    valid = false;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $("add-student-email-err").textContent = "Valid email is required.";
    valid = false;
  }
  if (!password || password.length < 8) {
    $("add-student-pass-err").textContent = "Password must be at least 8 characters.";
    valid = false;
  }
  if (!valid) return;

  const btn = $("add-student-btn");
  setLoading(btn, true, "Add Student");

  try {
    await users.addStudent({
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      course: course || undefined,
    });

    showToast(`Student ${firstName} ${lastName} added successfully!`, "success");
    closeAddStudentModal();
    await fetchStudents($("students-search").value);
    await fetchDashboardStats();

  } catch (err) {
    $("add-student-general-err").textContent = err.message || "Failed to add student.";
  } finally {
    setLoading(btn, false, "Add Student");
  }
}

/* ═══════════════════════════════════════════════════════
   FEES MANAGEMENT
═══════════════════════════════════════════════════════ */
async function updateFeesStatus(studentId, studentName, newStatus) {
  try {
    await users.updateStudentFees(studentId, newStatus);

    showToast(
      newStatus === "paid"
        ? `✅ ${studentName} marked as Fees Paid`
        : `⚠️ ${studentName} marked as Fees Unpaid`,
      newStatus === "paid" ? "success" : "info"
    );

    await fetchStudents($("students-search").value);
  } catch (err) {
    showToast("Failed to update fees: " + err.message, "error");
  }
}

async function autoMarkInactiveUnpaid() {
  const today = new Date();
  if (today.getDate() <= 5) {
    showToast("Auto-mark inactive runs after the 5th of each month.", "info");
    return;
  }

  const btn = $("btn-auto-mark-inactive");
  setLoading(btn, true, "⚡ Auto-Mark Inactive");

  try {
    const { message, updated } = await users.autoMarkInactive();
    showToast(message || `${updated} student(s) marked inactive.`, "success");
    await fetchStudents($("students-search").value);
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    setLoading(btn, false, "⚡ Auto-Mark Inactive");
  }
}

async function loadAttendanceHistory() {
  const tbody = $("att-history-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;

  try {
    const { sessions } = await attendance.sessions();

    if (!sessions?.length) {
      tbody.innerHTML = `<tr><td colspan="7">No records yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.map(row => {
      const subjectName = row.subject || "—";
      return `
        <tr>
          <td>${escHtml(row.date || row.session_date || "—")}</td>
          <td>${escHtml(row.class_name || row.class_level || "—")}</td>
          <td>${escHtml(subjectName)}</td>
          <td><span class="pill pill-green">—</span></td>
          <td><span class="pill pill-red">—</span></td>
          <td><span class="pill pill-blue">—</span></td>
          <td>
            <button class="btn-view" data-sess-id="${row.id}" data-sess-date="${escHtml(row.date || row.session_date || '')}" data-sess-subject="${escHtml(subjectName)}">
              View
            </button>
          </td>
        </tr>`;
    }).join("");

    tbody.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", () =>
        openAttDetailModal(btn.dataset.sessId, btn.dataset.sessDate, btn.dataset.sessSubject)
      );
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  boot();
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
