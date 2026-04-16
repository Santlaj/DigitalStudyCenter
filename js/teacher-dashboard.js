/**
 * teacher-dashboard.js
 * DigitalStudyCenter — Teacher Dashboard
 * Uses backend API via api.js instead of direct Supabase calls.
 */

import {
  auth, notes, assignments, users, attendance,
  analytics, getUser, setUser,
} from "./api.js";

// MODULE STATE
let currentTeacher    = null;
let teacherProfile    = null;
let allNotes          = [];
let allAssignments    = [];
let allStudents       = [];
let deleteCallback    = null;
let chartsInitialised = false;

// DOM HELPERS

/**
 * Shortcut to get any HTML element by its ID.
 * Without this: You'd have to write document.getElementById("...") everywhere,
 * making the code much longer and harder to read.
 */
const $  = (id)  => document.getElementById(id);

/**
 * Shortcut to select multiple HTML elements matching a CSS selector.
 * Without this: You'd have to write document.querySelectorAll("...") everywhere.
 */
const $$ = (sel) => document.querySelectorAll(sel);

/**
 * Capitalizes the first letter of each word (title case).
 * Used to display normalized lowercase subjects nicely.
 */
function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Shows a small popup message (toast) at the bottom of the screen.
 * Used to notify the teacher about success/error/info events (e.g. "Notes uploaded!").
 * The toast auto-hides after 3.5 seconds.
 * Without this: The teacher would get no visual feedback after actions like uploading or deleting.
 */
function showToast(message, type = "info") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className   = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = "toast"; }, 3500);
}

/**
 * Toggles a button between "loading" and "idle" states.
 * When loading: disables the button and shows a spinner + "Please wait…".
 * When idle: re-enables the button and restores its original text.
 * Without this: Buttons could be clicked multiple times during API calls,
 * causing duplicate submissions, and users wouldn't know an action is in progress.
 */
function setLoading(btnEl, loading, idleHtml = "Submit") {
  if (!btnEl) return;
  btnEl.disabled  = loading;
  btnEl.innerHTML = loading ? `<span class="spinner"></span>Please wait…` : idleHtml;
}

/**
 * Converts an ISO date string (e.g. "2026-04-10T12:00:00Z") into a readable format like "10 Apr 2026".
 * Returns "—" if no date is provided.
 * Without this: Raw ISO dates would appear in the UI, which are hard to read.
 */
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Converts an ISO date string into a readable format WITH time, like "10 Apr 2026, 14:30".
 * Used specifically for assignment deadlines where the exact time matters.
 * Without this: Teachers wouldn't see the exact time an assignment is due.
 */
function formatDeadline(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Returns a colored status pill (badge) for an assignment deadline:
 *   - Red "Overdue" if past the deadline
 *   - Amber "Due today" if within 24 hours
 *   - Green "Upcoming" if more than 24 hours away
 *   - Gray "No deadline" if no deadline is set
 * Without this: The assignments table would show no visual urgency indicators;
 * teachers wouldn't quickly see which assignments are overdue at a glance.
 */
function deadlinePill(iso) {
  if (!iso) return `<span class="pill pill-gray">No deadline</span>`;
  const diff = new Date(iso) - new Date();
  if (diff < 0)         return `<span class="pill pill-red">Overdue</span>`;
  if (diff < 86400000)  return `<span class="pill pill-amber">Due today</span>`;
  return `<span class="pill pill-green">Upcoming</span>`;
}

/**
 * Extracts the initials from a name (e.g. "Ravi Singh" → "RS").
 * Used for avatar circles in the sidebar and topnav when no profile photo exists.
 * Without this: Avatars would show nothing or a default "T" for all teachers.
 */
function initials(name) {
  if (!name) return "T";
  return name.split(" ").map(p => p[0]?.toUpperCase() || "").filter(Boolean).slice(0, 2).join("");
}

/**
 * Escapes special HTML characters to prevent XSS (cross-site scripting) attacks.
 * Converts characters like <, >, &, " into their safe HTML entity equivalents.
 * Without this: If a note title contains HTML like "<script>alert('hacked')</script>",
 * it would execute as real code in the browser — a critical security vulnerability.
 */
function escHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ──────────────────────────────────────────────────
// BOOT — AUTH GUARD
// ──────────────────────────────────────────────────

/**
 * The main startup function — runs when the page loads.
 * 1. Checks if the user is logged in (via API session check)
 * 2. Verifies the user is actually a "teacher" (redirects students away)
 * 3. Shows the teacher's name/avatar in the UI
 * 4. Reveals the app and loads dashboard stats
 * Without this: The dashboard would never load. No auth check means anyone
 * could access teacher pages, and no data would be fetched.
 */
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

/**
 * Fills in the teacher's name, initials, email, and other profile info
 * across all UI elements — sidebar, topnav, welcome message, and profile form.
 * Without this: The UI would show blank names, empty avatars, and the profile
 * form would have no pre-filled data to edit.
 */
function applyProfileToUI() {
  const name = teacherProfile?.full_name
    || `${teacherProfile?.first_name || ""} ${teacherProfile?.last_name || ""}`.trim()
    || teacherProfile?.email || "Teacher";

  const short = name.split(" ")[0] || "Teacher";
  const ini   = initials(name);

  $("sidebar-user-name").textContent            = name;
  $("sidebar-avatar-text").textContent          = ini;
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

/**
 * Hides the "loading/authenticating" screen and reveals the actual app.
 * Without this: The user would be stuck on a loading screen forever,
 * even after successful authentication.
 */
function showApp() {
  $("auth-guard").classList.add("hidden");
  $("app-shell").classList.add("visible");
}

// ──────────────────────────────────────────────────
// FETCH DASHBOARD STATS
// ──────────────────────────────────────────────────

/**
 * Fetches and displays the top-level dashboard numbers:
 * total students, notes, assignments, and courses.
 * Also triggers loading of recent notes and recent assignments lists.
 * Without this: The dashboard stat cards would show "—" forever and
 * the recent activity lists would remain empty.
 */
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

/**
 * Loads and renders the 5 most recent notes on the dashboard "Recent Notes" card.
 * Shows each note's title, subject, and upload date.
 * Without this: The "Recent Notes" section on the dashboard would be empty
 * or show a permanent "Loading…" state.
 */
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

/**
 * Loads and renders the 5 most recent assignments on the dashboard.
 * Each assignment shows its title, subject, deadline, and a colored status badge
 * (Overdue / Due today / Upcoming / No deadline).
 * Without this: The "Recent Assignments" section on the dashboard would be blank.
 */
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

// ──────────────────────────────────────────────────
// UPLOAD NOTES
// ──────────────────────────────────────────────────

/**
 * Handles the entire "Upload Notes" flow:
 * 1. Validates form fields (title, subject, file type & size)
 * 2. Shows a progress bar during upload
 * 3. Sends the PDF file to the server via API
 * 4. On success: shows a toast, resets the form, refreshes stats, and navigates to "My Notes"
 * Without this: Teachers would have no way to upload study notes/PDFs to the platform.
 */
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

/**
 * Clears all fields in the upload notes form (title, subject, course, description, file).
 * Called after a successful upload to prepare for the next one.
 * Without this: Old data would remain in the form after uploading, which could
 * confuse the teacher or cause accidental duplicate uploads.
 */
function resetUploadForm() {
  ["note-title","note-subject","note-course","note-description"].forEach(id => { $(id).value = ""; });
  $("note-file").value           = "";
  $("file-selected").textContent = "";
}

/**
 * Enables drag-and-drop file uploading on the file drop zone.
 * When a file is dragged over the zone, it highlights; when dropped, it sets the file input.
 * Also handles the normal "click to browse" file selection.
 * Without this: Teachers would only be able to click "Browse" to select files.
 * Drag-and-drop would not work, making the upload experience less convenient.
 */
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

/**
 * Updates the file label text below the drop zone to show the selected filename and size.
 * Example output: "📎 physics-notes.pdf (0.45 MB)"
 * Without this: After selecting a file, the teacher wouldn't see which file was selected
 * or how big it is, leading to confusion.
 */
function updateFileLabel(file) {
  $("file-selected").textContent =
    `📎 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
}

// ──────────────────────────────────────────────────
// LOAD NOTES TABLE
// ──────────────────────────────────────────────────

/**
 * Fetches all notes uploaded by this teacher and renders them in the "My Notes" table.
 * Supports optional search query filtering.
 * Each row shows: title, subject, date, download count, and view/delete buttons.
 * Also wires up the delete button on each row to open a confirmation modal.
 * Without this: The "My Notes" section would be empty. Teachers couldn't view,
 * search, or manage any of their uploaded notes.
 */
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

/**
 * Deletes a specific note by its ID via API call.
 * After deletion: shows a success toast, refreshes the notes table and dashboard stats.
 * Without this: The delete buttons on notes would do nothing. Teachers couldn't remove
 * any notes they've uploaded.
 */
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

// ──────────────────────────────────────────────────
// CREATE ASSIGNMENT
// ──────────────────────────────────────────────────

/**
 * Handles the "Create Assignment" form submission:
 * 1. Validates inputs (title, subject, deadline are required)
 * 2. Sends the new assignment to the API
 * 3. Clears the form, refreshes the assignments table and dashboard stats
 * Without this: Teachers would have no way to create/post assignments for students.
 */
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

// ──────────────────────────────────────────────────
// LOAD ASSIGNMENTS TABLE
// ──────────────────────────────────────────────────

/**
 * Fetches all assignments created by this teacher and renders them in a table.
 * Each row shows: title, subject, deadline (formatted), status pill, and a delete button.
 * Wires up delete buttons to open the confirmation modal.
 * Without this: The "Assignments" section would be empty. Teachers couldn't see
 * or manage any of their posted assignments.
 */
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

/**
 * Deletes a specific assignment by its ID via API call.
 * After deletion: shows a success toast, refreshes the table and dashboard stats.
 * Without this: Delete buttons on assignments would do nothing. Teachers couldn't
 * remove assignments they've posted.
 */
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

// ──────────────────────────────────────────────────
// FETCH STUDENTS
// ──────────────────────────────────────────────────

/**
 * Fetches and displays the full list of students in a table.
 * Supports optional search query. Each row shows:
 *   name (with avatar initials), email, course, last activity date,
 *   fee status (Paid/Unpaid), active status, and action buttons
 *   (Mark Paid/Unpaid, Activate/Deactivate).
 * Also wires up all the action buttons for fees and student status toggling.
 * Without this: The "Students" section would be empty. Teachers couldn't view,
 * search, or manage any students on the platform.
 */
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
      const lastAct   = s.last_activity ? formatDeadline(s.last_activity) : "Never";
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

// ──────────────────────────────────────────────────
// ANALYTICS
// ──────────────────────────────────────────────────

/**
 * Loads and renders the analytics charts (Downloads line chart, Student Activity bar chart,
 * and Submissions doughnut chart) using Chart.js.
 * Only initialises once (skips if charts already exist) to avoid duplicating canvases.
 * Without this: The "Analytics" section would show empty chart canvases with no data.
 * Teachers wouldn't have any visual insights into platform usage.
 */
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

// ──────────────────────────────────────────────────
// SAVE PROFILE
// ──────────────────────────────────────────────────

/**
 * Saves updated profile information (first name, last name, subject, bio) to the server.
 * On success: updates the local profile object, refreshes all UI elements showing the name,
 * and displays a success message.
 * Without this: The "Save Changes" button on the profile page would do nothing.
 * Teachers couldn't update their name, subject, or bio.
 */
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

// ──────────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────────

/**
 * Logs the teacher out by calling the auth API logout endpoint.
 * This clears the session and redirects to the login page.
 * Without this: The logout button would do nothing. Teachers would be stuck
 * logged in with no way to sign out.
 */
function logoutTeacher() {
  auth.logout();
}

// ──────────────────────────────────────────────────
// DELETE MODAL
// ──────────────────────────────────────────────────

/**
 * Opens the confirmation modal before deleting a note or assignment.
 * Shows the item name and stores the delete callback to execute if the user confirms.
 * Without this: Items would be deleted instantly without any confirmation,
 * leading to accidental data loss.
 */
function openDeleteModal(name, callback) {
  $("delete-item-name").textContent = name;
  deleteCallback = callback;
  $("delete-modal").classList.add("open");
}

/**
 * Closes the delete confirmation modal and clears the stored callback.
 * Without this: The modal would stay open forever after clicking cancel/close,
 * blocking the entire UI.
 */
function closeDeleteModal() {
  $("delete-modal").classList.remove("open");
  deleteCallback = null;
}

// ──────────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────────

/** Maps section IDs to their display-friendly titles shown in the breadcrumb. */
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

/**
 * Navigates to a specific section of the dashboard (e.g. "my-notes", "students").
 * 1. Shows the target section and hides all others
 * 2. Highlights the active sidebar nav item
 * 3. Updates the breadcrumb text in the top bar
 * 4. Triggers data loading for the target section (e.g. fetches students list)
 * 5. On mobile: closes the sidebar after navigation
 * 6. Scrolls to the top of the content area
 * Without this: The entire single-page navigation would break. Clicking sidebar links
 * would do nothing — no section switching, no data loading, no visual feedback.
 */
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

// ──────────────────────────────────────────────────
// EVENT WIRING
// ──────────────────────────────────────────────────

/**
 * Connects ALL interactive UI elements to their respective handler functions.
 * This includes: sidebar navigation clicks, logout button, sidebar toggle,
 * upload/reset buttons, create assignment button, search inputs (with debounce),
 * delete modal buttons, profile save, attendance controls, add student modal,
 * and the auto-mark-inactive button.
 * Without this: The ENTIRE dashboard would be non-interactive. No button clicks,
 * no form submissions, no navigation — nothing would respond to user input.
 */
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


// ──────────────────────────────────────────────────
// ATTENDANCE MODULE
// ──────────────────────────────────────────────────
let attStudents = [];
let attStatusMap = {};
let attNoteMap = {};
let attSessionId = null;
let viewingSessionId = null;

/**
 * Loads the list of available subjects for a given class in the attendance dropdown.
 * Currently resets to a placeholder; intended to populate from a subjects database table.
 * Without this: The subject dropdown in attendance would never update when the class changes.
 */
async function loadSubjectsForClass(attClass) {
  const select = $("att-subject");
  if (!attClass) {
    select.innerHTML = `<option value="">Select Subject</option>`;
    return;
  }
  // Fetch subjects from the same endpoint that loads students (no extra API call pattern)
  // We call students-for-class with class param — server returns { students, subjects }
  try {
    const { subjects } = await attendance.getStudentsForClass(attClass);
    select.innerHTML = `<option value="">Select Subject</option>`;
    if (subjects && subjects.length > 0) {
      subjects.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = titleCase(s);
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.warn("Could not load subjects:", err.message);
    select.innerHTML = `<option value="">Select Subject</option>`;
  }
}

/**
 * Sets today's date as the default value in the attendance date picker.
 * Only sets it if the field is currently empty (doesn't override a manually selected date).
 * Without this: The date picker would start blank, forcing teachers to manually pick
 * today's date every time they open the attendance section.
 */
function setDefaultAttDate() {
  const el = $("att-date");
  if (el && !el.value) {
    el.value = new Date().toISOString().slice(0, 10);
  }
}

/**
 * Loads the list of students for attendance marking based on the selected date, class, and subject.
 * Validates that all three fields are filled, then fetches students from the API.
 * Initialises all students as "present" by default and renders the attendance table.
 * Without this: The "Load Students" button in attendance would do nothing.
 * Teachers couldn't load any students to mark their attendance.
 */
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
    const { students } = await attendance.getStudentsForClass(attClass);

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

/**
 * Renders the attendance marking table with all loaded students.
 * Each row has: checkbox, student name/avatar, email, course,
 * Present/Absent toggle buttons, and a notes input field.
 * Wires up the status buttons and note inputs to update the local state maps.
 * Without this: After loading students, the attendance table would remain empty.
 * Teachers couldn't see or mark any student's attendance.
 */
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

/**
 * Updates a single student's attendance status (present/absent) in the local state,
 * then re-renders the table and updates the summary counts.
 * Without this: Clicking Present/Absent buttons would have no effect.
 * The student's status wouldn't change visually or in the data.
 */
function setStudentStatus(sid, status) {
  attStatusMap[sid] = status;
  renderAttTable();
  updateAttSummary();
}

/**
 * Marks ALL students as either "present" or "absent" at once.
 * Triggered by the "Mark All Present" / "Mark All Absent" buttons.
 * Without this: Teachers would have to click each student's button individually,
 * which is extremely tedious for large classes.
 */
function markAll(status) {
  attStudents.forEach(s => {
    attStatusMap[s.id] = status;
  });
  renderAttTable();
  updateAttSummary();
}

/**
 * Checks or unchecks all row checkboxes in the attendance table.
 * Triggered by the "Select All" checkbox in the table header.
 * Without this: The "Select All" checkbox would do nothing. Teachers couldn't
 * quickly select all students at once.
 */
function toggleSelectAll(checked) {
  document.querySelectorAll(".att-row-check").forEach(cb => {
    cb.checked = checked;
  });
}

/**
 * Updates the attendance summary bar showing present/absent counts and percentages.
 * Recalculates totals from the current attStatusMap and updates the visual progress bar.
 * Without this: The summary numbers (present/absent/total) would never update
 * as the teacher marks attendance, giving no real-time feedback.
 */
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

/**
 * Saves the current attendance session (date, class, subject, and all student records)
 * to the server via API. Shows a success/error toast and refreshes the history table.
 * Without this: The "Save Attendance" button would do nothing. All attendance
 * marking would be lost when the page is closed — nothing would be stored.
 */
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

/**
 * Closes the attendance detail modal (the popup showing individual student records for a session).
 * Without this: The modal would stay open permanently after viewing a session's details.
 */
function closeAttDetailModal() {
  $("att-detail-modal").classList.remove("open");
  viewingSessionId = null;
}

/**
 * Opens a modal showing detailed attendance records for a specific past session.
 * Fetches the student-level records from the API and displays them in a table
 * (name, email, status, notes). Also wires up the "Delete Session" button.
 * Without this: Clicking "View" on an attendance history row would do nothing.
 * Teachers couldn't drill down into individual session details or delete sessions.
 */
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

// ──────────────────────────────────────────────────
// ADD STUDENT MODAL
// ──────────────────────────────────────────────────

/**
 * Opens the "Add Student" modal and resets all form fields and error messages.
 * Without this: The "Add Student" button would do nothing. Teachers couldn't
 * open the form to register new students.
 */
function openAddStudentModal() {
  ["add-student-name-err","add-student-email-err","add-student-pass-err","add-student-general-err"]
    .forEach(id => { const el = $(id); if (el) el.textContent = ""; });
  ["add-student-firstname","add-student-lastname","add-student-email","add-student-course","add-student-password"]
    .forEach(id => { const el = $(id); if (el) el.value = ""; });
  $("add-student-modal").classList.add("open");
}

/**
 * Closes the "Add Student" modal.
 * Without this: The modal would stay open permanently after adding a student
 * or after clicking cancel.
 */
function closeAddStudentModal() {
  $("add-student-modal").classList.remove("open");
}

/**
 * Validates and submits the "Add Student" form to create a new student account.
 * Validates: first/last name, valid email format, and password (min 8 chars).
 * On success: shows a toast, closes the modal, and refreshes the students list + stats.
 * Without this: The "Add Student" submit button would do nothing.
 * Teachers would have no way to register new students on the platform.
 */
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

// ──────────────────────────────────────────────────
// FEES MANAGEMENT
// ──────────────────────────────────────────────────

/**
 * Updates a specific student's fee status to "paid" or "unpaid" via the API.
 * Shows a success/error toast and refreshes the students table.
 * Without this: The "Mark Paid" / "Mark Unpaid" buttons in the students table
 * would do nothing. Teachers couldn't track or update fee payments.
 */
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

/**
 * Automatically marks students as "inactive" if they haven't paid fees after the 5th.
 * Only runs after the 5th of each month to avoid premature deactivation.
 * Without this: This bulk-action button would do nothing. Teachers would have to
 * manually deactivate each unpaid student one-by-one, which is tedious for large classes.
 */
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

/**
 * Fetches and displays the attendance history table — a list of all past attendance sessions.
 * Each row shows: date, class, subject, and a "View" button to see detailed records.
 * Wires up the "View" buttons to open the detail modal.
 * Without this: The attendance history table would remain empty. Teachers couldn't
 * review any previously saved attendance sessions.
 */
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
      const pct = row.total_count > 0 ? Math.round((row.present_count / row.total_count) * 100) : 0;
      return `
        <tr>
          <td>${escHtml(row.date || row.session_date || "—")}</td>
          <td>${escHtml(row.class_name || row.class_level || "—")}</td>
          <td>${escHtml(titleCase(subjectName))}</td>
          <td><span class="pill pill-green">${row.present_count ?? "—"}</span></td>
          <td><span class="pill pill-red">${row.absent_count ?? "—"}</span></td>
          <td><span class="pill pill-blue">${pct}%</span></td>
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

// ──────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────

/**
 * Entry point: when the page DOM is fully loaded, wire up all event listeners
 * and then start the authentication/boot process.
 * Without this: Nothing would ever run. The page would load as static HTML
 * with zero interactivity and no data.
 */
document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  boot();
});

/**
 * Global click handler using event delegation for:
 * 1. Dark mode toggle — switches between light/dark theme and saves preference to localStorage.
 * 2. Sidebar inner collapse — closes the sidebar on mobile when the collapse button is clicked.
 * Without this: The dark mode toggle button would do nothing. The sidebar collapse
 * button inside the sidebar would also stop working.
 */
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

/**
 * Checks localStorage on page load for a saved dark mode preference.
 * If the user previously enabled dark mode, it re-applies the "dark-mode" class immediately.
 * Without this: Dark mode preference wouldn't persist. Every page reload would reset to light mode,
 * even if the user had previously switched to dark.
 */
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-mode"); document.documentElement.classList.add("dark-mode");
}
