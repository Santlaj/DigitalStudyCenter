/* teacher/notes.js — Note upload, listing, and management logic for teacher portal. */

import { notes } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDate, showToast, setLoading } from "../shared/helpers.js";
import { fetchDashboardStats } from "./dashboard.js";
import { tableSkeleton } from "../shared/skeleton.js";

export async function uploadNotes(navigateToFn) {
  ["note-title-err","note-subject-err","note-file-err","upload-general-err"]
    .forEach(id => { $(id).textContent = ""; });

  const title = $("note-title").value.trim(), subject = $("note-subject").value.trim();
  const course = $("note-course").value.trim(), description = $("note-description").value.trim();
  const file = $("note-file").files?.[0];

  let valid = true;
  if (!title)   { $("note-title-err").textContent = "Title is required."; valid = false; }
  if (!subject) { $("note-subject-err").textContent = "Subject is required."; valid = false; }
  if (!file)                          { $("note-file-err").textContent = "Please select a PDF file."; valid = false; }
  else if (file.type !== "application/pdf") { $("note-file-err").textContent = "Only PDF files are accepted."; valid = false; }
  else if (file.size > 1 * 1024 * 1024)     { $("note-file-err").textContent = "File must be under 1 MB."; valid = false; }
  if (!valid) return;

  const btn = $("upload-notes-btn"), progressWrap = $("upload-progress-wrap");
  const progressBar = $("upload-progress-bar"), progressLabel = $("upload-progress-label");

  setLoading(btn, true, "Upload Notes");
  progressWrap.classList.remove("hidden");
  progressBar.style.width = "20%"; progressLabel.textContent = "Uploading file to server…";

  try {
    await notes.upload(title, subject, course, description, file);
    progressBar.style.width = "100%"; progressLabel.textContent = "Done!";
    showToast("Notes uploaded successfully!", "success");
    resetUploadForm();
    // Invalidate caches so fresh data is fetched
    state.notesLoaded = false;
    state.dashboardLoaded = false;
    await fetchDashboardStats();
    if (navigateToFn) setTimeout(() => navigateToFn("my-notes"), 900);
  } catch (err) {
    $("upload-general-err").textContent = err.message || "Upload failed.";
    progressWrap.classList.add("hidden");
  } finally {
    setLoading(btn, false, "Upload Notes");
    setTimeout(() => { progressWrap.classList.add("hidden"); progressBar.style.width = "0%"; }, 1400);
  }
}

export function resetUploadForm() {
  ["note-title","note-subject","note-description"].forEach(id => { if ($(id)) $(id).value = ""; });
  if ($("note-course")) $("note-course").value = "all";
  if ($("note-file")) $("note-file").value = "";
  if ($("file-selected")) $("file-selected").textContent = "";
}

export function initFileDrop() {
  const zone = $("file-drop-zone"), input = $("note-file");
  if (!zone || !input) return;
  zone.addEventListener("dragover",  (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.classList.remove("dragover");
    const f = e.dataTransfer.files?.[0];
    if (f) { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; $("file-selected").textContent = `📎 ${f.name} (${(f.size/1024/1024).toFixed(2)} MB)`; }
  });
  input.addEventListener("change", () => { if (input.files?.[0]) $("file-selected").textContent = `📎 ${input.files[0].name} (${(input.files[0].size/1024/1024).toFixed(2)} MB)`; });
}

export async function loadNotesTable(query = "", append = false) {
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
    const { notes: data, count } = await notes.teacherNotes(query, limit, state.notesOffset);
    
    state.allNotes = append ? [...state.allNotes, ...data] : data;
    state.notesOffset += limit;
    
    if (!query && !append) state.notesLoaded = true;

    renderNotesTable(tbody, state.allNotes);

    if (loadMoreBtn) {
      if (state.allNotes.length < count) {
        loadMoreBtn.classList.remove("hidden");
        loadMoreBtn.onclick = () => loadNotesTable(query, true);
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
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No notes found. Upload your first note!</td></tr>`; return; }
  tbody.innerHTML = data.map(n => `
    <tr>
      <td><strong>${escapeHtml(n.title)}</strong>${n.course ? `<br><span style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(n.course)}</span>` : ""}</td>
      <td>${escapeHtml(n.subject)}</td><td>${formatDate(n.created_at)}</td>
      <td><span class="pill pill-blue">${n.download_count ?? 0}</span></td>
      <td><a href="${escapeHtml(n.file_url)}" target="_blank" class="btn-icon" title="View PDF">📄 View</a>
        <button class="btn-icon delete" data-delete-note="${escapeHtml(n.id)}" data-name="${escapeHtml(n.title)}" title="Delete">🗑</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-delete-note]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window._openDeleteModal) window._openDeleteModal(btn.dataset.name, () => deleteNote(btn.dataset.deleteNote));
    });
  });
}

async function deleteNote(id) {
  try {
    await notes.remove(id);
    showToast("Note deleted.", "success");
    // Invalidate caches
    state.notesLoaded = false;
    state.dashboardLoaded = false;
    await loadNotesTable($("notes-search").value);
    await fetchDashboardStats();
  }
  catch (err) { showToast("Delete failed: " + err.message, "error"); }
}
