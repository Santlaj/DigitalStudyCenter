/* teacher/attendance.js — Attendance marking, history, and session management. */

import { attendance, users } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, initials, showToast, setLoading } from "../shared/helpers.js";
import { tableSkeleton } from "../shared/skeleton.js";

export function setDefaultAttDate() {
  const el = $("att-date");
  if (el && !el.value) el.value = new Date().toISOString().slice(0, 10);
}



export async function loadStudentsForAttendance() {
  const date = $("att-date").value, attClass = $("att-class").value;
  $("att-err").textContent = "";
  if (!date) { $("att-err").textContent = "Select date."; return; }
  if (!attClass) { $("att-err").textContent = "Select class."; return; }

  const btn = $("att-load-btn");
  setLoading(btn, true, "Load Students");
  try {
    const { students, subjects } = await attendance.getStudentsForClass(attClass);
    state.attStudents = students || [];
    state.subjects = subjects || [];

    const select = $("att-subject");
    if (!state.subjects.length) {
      select.innerHTML = `<option value="">No subjects found</option>`;
    } else {
      select.innerHTML = `<option value="">Select Subject</option>` +
        state.subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    }

    state.attStatusMap = {}; state.attNoteMap = {};
    state.attStudents.forEach(s => { state.attStatusMap[s.id] = "present"; });
    renderAttTable(); updateAttSummary();
  } catch (err) { $("att-err").textContent = err.message; }
  finally { setLoading(btn, false, "Load Students"); }
}

export function renderAttTable() {
  const tbody = $("att-tbody");
  if (!state.attStudents.length) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No students</td></tr>`; return; }

  tbody.innerHTML = state.attStudents.map(s => {
    const name = s.full_name || `${s.first_name || ""} ${s.last_name || ""}`.trim();
    const ini = initials(name), status = state.attStatusMap[s.id];
    const rowClass = status === "present" ? "att-row-present" : status === "absent" ? "att-row-absent" : "";
    return `
      <tr id="att-row-${s.id}" class="${rowClass}">
        <td><div class="att-student-cell"><div class="att-avatar-mini">${ini}</div><span>${escapeHtml(name)}</span></div></td>
        <td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.course || "—")}</td>
        <td>
          <label class="att-toggle">
            <input type="checkbox" class="att-status-toggle" data-sid="${s.id}" ${status === "present" ? "checked" : ""}>
            <span class="att-slider"></span>
          </label>
        </td>
        <td><input class="att-note-input" data-sid="${s.id}" value="${escapeHtml(state.attNoteMap[s.id] || "")}"></td>
      </tr>`;
  }).join("");

  tbody.querySelectorAll(".att-status-toggle").forEach(chk => { chk.onchange = (e) => setStudentStatus(chk.dataset.sid, e.target.checked ? "present" : "absent"); });
  tbody.querySelectorAll(".att-note-input").forEach(input => { input.oninput = () => { state.attNoteMap[input.dataset.sid] = input.value; }; });
}

function setStudentStatus(sid, status) { state.attStatusMap[sid] = status; renderAttTable(); updateAttSummary(); }
export function markAll(status) { state.attStudents.forEach(s => { state.attStatusMap[s.id] = status; }); renderAttTable(); updateAttSummary(); }


export function updateAttSummary() {

  const total = state.attStudents.length;
  const present = Object.values(state.attStatusMap).filter(v => v === "present").length;
  const absent = Object.values(state.attStatusMap).filter(v => v === "absent").length;
  $("att-present-num").textContent = present; $("att-absent-num").textContent = absent; $("att-total-num").textContent = total;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  $("att-bar-present").style.width = pct + "%"; $("att-bar-absent").style.width = (100 - pct) + "%";
}

export async function saveAttendance() {
  const date = $("att-date").value,
    attClass = $("att-class").value,
    subjectVal = $("att-subject").value;

  $("att-err").textContent = "";
  if (!date || !attClass) return;

  if (!subjectVal) {
    $("att-err").textContent = "Please select a subject.";
    return;
  }

  const btn = $("att-save-btn");

  setLoading(btn, true, "Saving");

  try {
    const records = state.attStudents.map(s => ({ student_id: s.id, status: state.attStatusMap[s.id], note: state.attNoteMap[s.id] || null }));
    await attendance.saveSession({ date, class_name: attClass, subject: subjectVal, records });
    showToast("Attendance saved", "success");
    state.attendanceLoaded = false;
    loadAttendanceHistory();
  } catch (err) { showToast("Save failed: " + err.message, "error"); }
  finally { setLoading(btn, false, "Save Attendance"); }
}

export function closeAttDetailModal() { $("att-detail-modal").classList.remove("open"); state.viewingSessionId = null; }

export async function openAttDetailModal(sessionId, sessionDate, subjectName) {
  state.viewingSessionId = sessionId;
  $("att-detail-title").textContent = `Attendance — ${sessionDate}`;
  $("att-detail-sub").textContent = `Subject: ${subjectName}`;
  $("att-detail-modal").classList.add("open");
  $("att-detail-tbody").innerHTML = tableSkeleton(3, 4);

  try {
    const { records } = await attendance.getSessionRecords(sessionId);
    if (!records?.length) {
      $("att-detail-tbody").innerHTML =

        `
      <tr>
        <td colspan="4" class="table-empty">No records found.</td>
      </tr>
      `;
      return;
    }

    $("att-detail-tbody").innerHTML = records.map(r => {
      const u = r.users || {},
        name = u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";

      return `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td> <span class="pill ${r.status === "present" ? "pill-green" : "pill-red"}">${escapeHtml(r.status)}</span></td>
        <td>${escapeHtml(r.note || "—")}</td>
      </tr>`;

    }).join("");

    $("att-detail-delete-btn").onclick = () => {
      window._openDeleteModal("this attendance session", async () => {
        try {
          await attendance.deleteSession(sessionId);
          closeAttDetailModal();
          showToast("Session deleted.", "success");
          state.attendanceLoaded = false;
          loadAttendanceHistory();
        }
        catch (err) {
          showToast("Delete failed: " + err.message, "error");
        }
      });
    };
  }
  catch (err) {
    $("att-detail-tbody").innerHTML =
      `<tr>
        <td colspan="4" class="table-empty">Error: ${escapeHtml(err.message)}</td> 
      </tr>
      `;
  }

}

export async function loadAttendanceHistory() {
  const tbody = $("att-history-tbody");

  // Cache-first: skip API call if already loaded
  if (state.attendanceLoaded && state.attendanceSessions.length >= 0) {
    renderAttHistory(tbody, state.attendanceSessions);
    return;
  }

  tbody.innerHTML = tableSkeleton(5, 7);

  try {
    const { sessions } = await attendance.sessions();
    state.attendanceSessions = sessions || [];
    state.attendanceLoaded = true;
    renderAttHistory(tbody, state.attendanceSessions);

  } catch (err) {
    tbody.innerHTML =
      `<tr>
    <td colspan="7" class="table-empty">Error: ${escapeHtml(err.message)}</td>
    </tr>`;
  }
}

function renderAttHistory(tbody, sessions) {
  if (!sessions?.length) {
    tbody.innerHTML =
      `<tr>
        <td colspan="7">No records yet.</td>
     </tr>`;
    return;
  }

  tbody.innerHTML = sessions.map(row => {
    const subjectName = row.subject || "—";
    const pct = row.total_count > 0 ? Math.round((row.present_count / row.total_count) * 100) : 0;
    return `
    <tr>
    <td>${escapeHtml(row.date || row.session_date || "—")}</td>
    <td>${escapeHtml(row.class_name || row.class_level || "—")}</td>

      <td>${escapeHtml(subjectName)}</td>
      <td><span class="pill pill-green">${row.present_count ?? "—"}</span></td>
      <td><span class="pill pill-red">${row.absent_count ?? "—"}</span></td>
      <td><span class="pill pill-blue">${pct}%</span></td>
      <td><button class="btn-view" data-sess-id="${row.id}" data-sess-date="${escapeHtml(row.date || row.session_date || '')}" data-sess-subject="${escapeHtml(subjectName)}">View</button></td></tr>`;
  }).join("");

  tbody.querySelectorAll(".btn-view").forEach(btn => {
    btn.addEventListener("click", () => openAttDetailModal(btn.dataset.sessId, btn.dataset.sessDate, btn.dataset.sessSubject));
  });
}
