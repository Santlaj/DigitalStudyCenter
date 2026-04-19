/**
 * student/notes.js
 * Notes table and download tracking for student portal.
 */

import { notes } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDate, showToast } from "../shared/helpers.js";
import { tableSkeleton } from "../shared/skeleton.js";

export async function fetchNotes(query = "", append = false) {
  const tbody = $("notes-tbody");
  const loadMoreBtn = $("notes-load-more");

  if (!append) {
    state.notesOffset = 0;
    state.allNotes = [];
    tbody.innerHTML = tableSkeleton(5, 5);
  }

  // Cache-first optimization
  if (!query && !append && state.notesLoaded && state.allNotes.length > 0) {
    renderNotesTable(tbody, state.allNotes);
    return;
  }

  try {
    const limit = 20;
    const { notes: data, count } = await notes.list(query, limit, state.notesOffset);

    state.allNotes = append ? [...state.allNotes, ...data] : data;
    state.notesOffset += limit;

    if (!query && !append) state.notesLoaded = true;

    renderNotesTable(tbody, state.allNotes);

    if (loadMoreBtn) {
      if (state.allNotes.length < count) {
        loadMoreBtn.classList.remove("hidden");
        loadMoreBtn.onclick = () => fetchNotes(query, true);
      } else {
        loadMoreBtn.classList.add("hidden");
      }
    }
  } catch (err) {
    if (!append) tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${escapeHtml(err.message)}</td></tr>`;
    else showToast("Failed to load more: " + err.message, "error");
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
          <strong>${escapeHtml(n.title)}</strong>
          ${n.description ? `<br><span style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(n.description.slice(0, 60))}${n.description.length > 60 ? "…" : ""}</span>` : ""}
        </td>
        <td><span class="pill pill-blue">${escapeHtml(n.subject)}</span></td>
        <td>${escapeHtml(teacher)}</td>
        <td>${formatDate(n.created_at)}</td>
        <td>
          <button class="btn-download"
            data-note-id="${escapeHtml(n.id)}"
            data-note-title="${escapeHtml(n.title)}"
            data-file-url="${escapeHtml(n.file_url)}">
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
