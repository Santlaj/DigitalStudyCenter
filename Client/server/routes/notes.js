/**
 * routes/notes.js
 * Notes CRUD — list, upload (teacher), delete (teacher), download tracking.
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate, requireRole } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimiter");
const { getOrSet, invalidatePrefix } = require("../lib/cache");

// Multer — store file in memory, 1MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed."));
    }
    cb(null, true);
  },
});

/**
 * GET /api/notes
 * List all notes with teacher info. Cached 120s.
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const query = req.query.search || "";
    const cacheKey = `notes:list:${query}`;

    const data = await getOrSet(cacheKey, async () => {
      let q = supabaseAdmin
        .from("notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (query) q = q.ilike("title", `%${query}%`);

      const { data: notesData, error } = await q;
      if (error) throw error;
      if (!notesData || notesData.length === 0) return [];

      const teacherIds = [...new Set(notesData.map(n => n.teacher_id).filter(Boolean))];
      
      let usersMap = {};
      if (teacherIds.length > 0) {
        const { data: usersData, error: uErr } = await supabaseAdmin
          .from("users")
          .select("id, full_name, first_name, last_name, email")
          .in("id", teacherIds);
        
        if (!uErr && usersData) {
          usersData.forEach(u => { usersMap[u.id] = u; });
        }
      }

      return notesData.map(n => ({
        ...n,
        users: usersMap[n.teacher_id] || null
      }));
    }, 120);

    res.json({ notes: data, count: data.length });
  } catch (err) {
    console.error("Fetch notes error:", err.message);
    res.status(500).json({ error: "Failed to fetch notes." });
  }
});

/**
 * GET /api/notes/recent
 * Last 5 notes. Cached 60s.
 */
router.get("/recent", authenticate, async (req, res) => {
  try {
    const data = await getOrSet("notes:recent", async () => {
      const { data, error } = await supabaseAdmin
        .from("notes")
        .select("id, title, subject, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    }, 60);

    res.json({ notes: data });
  } catch (err) {
    console.error("Recent notes error:", err.message);
    res.status(500).json({ error: "Failed to fetch recent notes." });
  }
});

/**
 * GET /api/notes/teacher
 * Notes uploaded by the authenticated teacher. Cached 60s.
 */
router.get("/teacher", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const query = req.query.search || "";
    const cacheKey = `notes:teacher:${req.user.id}:${query}`;

    const data = await getOrSet(cacheKey, async () => {
      let q = supabaseAdmin
        .from("notes")
        .select("*")
        .eq("teacher_id", req.user.id)
        .order("created_at", { ascending: false });

      if (query) q = q.ilike("title", `%${query}%`);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }, 60);

    res.json({ notes: data, count: data.length });
  } catch (err) {
    console.error("Teacher notes error:", err.message);
    res.status(500).json({ error: "Failed to fetch teacher notes." });
  }
});

/**
 * POST /api/notes
 * Upload a new note (teacher only).
 */
router.post("/", authenticate, requireRole("teacher"), uploadLimiter, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File must be under 1 MB." });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { title, subject, course, description } = req.body;

    if (!title || !subject) {
      return res.status(400).json({ error: "Title and subject are required." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "PDF file is required." });
    }

    // Upload to Supabase Storage
    const fileName = `${req.user.id}/${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;

    const { error: storageErr } = await supabaseAdmin.storage
      .from("notes")
      .upload(fileName, req.file.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (storageErr) throw new Error("Storage: " + storageErr.message);

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage.from("notes").getPublicUrl(fileName);
    const fileUrl = urlData?.publicUrl || "";

    // Insert database record
    const { data: note, error: dbErr } = await supabaseAdmin.from("notes").insert({
      teacher_id: req.user.id,
      title,
      subject,
      course: course || null,
      description: description || null,
      file_url: fileUrl,
      download_count: 0,
    }).select().single();

    if (dbErr) throw new Error("Database: " + dbErr.message);

    // Invalidate cache
    invalidatePrefix("notes:");

    res.status(201).json({ message: "Note uploaded successfully.", note });
  } catch (err) {
    console.error("Upload note error:", err.message);
    res.status(500).json({ error: err.message || "Upload failed." });
  }
});

/**
 * DELETE /api/notes/:id
 * Delete a note (teacher only, must own it).
 */
router.delete("/:id", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("notes")
      .delete()
      .eq("id", req.params.id)
      .eq("teacher_id", req.user.id);

    if (error) throw error;

    invalidatePrefix("notes:");
    res.json({ message: "Note deleted." });
  } catch (err) {
    console.error("Delete note error:", err.message);
    res.status(500).json({ error: "Failed to delete note." });
  }
});

/**
 * POST /api/notes/:id/download
 * Record a download and return the file URL.
 */
router.post("/:id/download", authenticate, async (req, res) => {
  try {
    const noteId = req.params.id;

    // Get note
    const { data: note, error: noteErr } = await supabaseAdmin
      .from("notes")
      .select("id, title, file_url, download_count")
      .eq("id", noteId)
      .single();

    if (noteErr || !note) {
      return res.status(404).json({ error: "Note not found." });
    }

    // Record download
    await supabaseAdmin.from("downloads").upsert({
      student_id: req.user.id,
      note_id: noteId,
      note_title: note.title,
      downloaded_at: new Date().toISOString(),
    }, { onConflict: "student_id,note_id" });

    // Increment counter
    await supabaseAdmin.from("notes")
      .update({ download_count: (note.download_count || 0) + 1 })
      .eq("id", noteId);

    res.json({ file_url: note.file_url });
  } catch (err) {
    console.error("Download note error:", err.message);
    res.status(500).json({ error: "Failed to process download." });
  }
});

module.exports = router;
