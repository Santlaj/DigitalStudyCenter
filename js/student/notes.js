/**
 * student/notes.js
 * Notes table and download tracking for student portal.
 */

import { notes } from "../api.js";
import { state } from "./state.js";
import { $, escHtml, formatDate, showToast } from "../shared/helpers.js";

export async function fetchNotes(query = "") {
  const tbody = $("notes-tbody");

  // Cache-first
  if (!query && state.notesLoaded && state.allNotes.length >= 0) {
    renderNotesTable(tbody, state.allNotes);
    return;
  }

  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Loading…</td></tr>`;

  try {
    const { notes: data } = await notes.list(query);
    state.allNotes = data || [];
    if (!query) state.notesLoaded = true;
    renderNotesTable(tbody, state.allNotes);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${escHtml(err.message)}</td></tr>`;
  }
}

function renderNotesTable(tbody, data) {
  $("notes-count").textContent = `${data.length} note${data.length !== 1 ? "s" : ""}`;
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No notes available yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(n => {
    const teacher = n.users?.full_name
      || `${n.users?.first_name || ""} ${n.users?.last_name || ""}`.trim()
      || "Teacher";
    return `
      <tr>
        <td>
          <strong>${escHtml(n.title)}</strong>
          ${n.description ? `<br><span style="font-size:0.78rem;color:var(--text-muted)">${escHtml(n.description.slice(0,60))}${n.description.length > 60 ? "…" : ""}</span>` : ""}
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
}

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
