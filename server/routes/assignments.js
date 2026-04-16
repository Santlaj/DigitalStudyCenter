/**
 * routes/assignments.js
 * Assignments CRUD + student submissions.
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate, requireRole } = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimiter");
const { createAssignmentRules } = require("../middleware/validate");
const { getOrSet, invalidatePrefix } = require("../lib/cache");

// 1MB limit for submissions
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF, DOC, or DOCX files are allowed."));
    }
    cb(null, true);
  },
});

/**
 * GET /api/assignments
 * List all assignments with teacher info.
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const query = req.query.search || "";
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const userRole = req.user.role;
    const userCourse = (req.user.course || "all").toLowerCase();
    const cacheKey = `assignments:list:${userRole}:${userCourse}:${query}:${limit}:${offset}`;

    const { assignments, count } = await getOrSet(cacheKey, async () => {
      let q = supabaseAdmin
        .from("assignments")
        .select("*, users!teacher_id(full_name, first_name, last_name)", { count: "exact" })
        .order("deadline", { ascending: true })
        .range(offset, offset + limit - 1);

      if (query) q = q.ilike("title", `%${query}%`);
      if (userRole === "student" && req.user.course) {
        q = q.or(`course.eq.all,course.eq.${userCourse},course.is.null`);
      }

      const { data, count: totalCount, error } = await q;
      if (error) throw error;
      return { assignments: data || [], count: totalCount || 0 };
    }, 120);

    res.json({ assignments, count });
  } catch (err) {
    console.error("Fetch assignments error:", err.message);
    res.status(500).json({ error: "Failed to fetch assignments." });
  }
});

/**
 * GET /api/assignments/teacher
 * Assignments created by the authenticated teacher.
 */
router.get("/teacher", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const { data, count, error } = await supabaseAdmin
      .from("assignments")
      .select("*", { count: "exact" })
      .eq("teacher_id", req.user.id)
      .order("deadline", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ assignments: data || [], count: count || 0 });
  } catch (err) {
    console.error("Teacher assignments error:", err.message);
    res.status(500).json({ error: "Failed to fetch assignments." });
  }
});

/**
 * POST /api/assignments
 * Create assignment (teacher only).
 */
router.post("/", authenticate, requireRole("teacher"), createAssignmentRules, async (req, res) => {
  try {
    const { title, description, deadline, course } = req.body;
    // Normalize subject to lowercase for consistency
    const subject = (req.body.subject || "").trim().toLowerCase();
    const courseVal = course ? course.toLowerCase() : "all";

    const { data, error } = await supabaseAdmin.from("assignments").insert({
      teacher_id: req.user.id,
      title,
      subject,
      course: courseVal,
      description: description || null,
      deadline: new Date(deadline).toISOString(),
    }).select().single();

    if (error) throw error;

    invalidatePrefix("assignments:");
    invalidatePrefix("dashboard:");
    res.status(201).json({ message: "Assignment created.", assignment: data });
  } catch (err) {
    console.error("Create assignment error:", err.message);
    res.status(500).json({ error: err.message || "Failed to create assignment." });
  }
});

/**
 * DELETE /api/assignments/:id
 * Delete assignment (teacher only, must own it).
 */
router.delete("/:id", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("assignments")
      .delete()
      .eq("id", req.params.id)
      .eq("teacher_id", req.user.id);

    if (error) throw error;

    invalidatePrefix("assignments:");
    invalidatePrefix("dashboard:");
    res.json({ message: "Assignment deleted." });
  } catch (err) {
    console.error("Delete assignment error:", err.message);
    res.status(500).json({ error: "Failed to delete assignment." });
  }
});

/**
 * GET /api/assignments/submissions
 * Get submitted assignment IDs for the current student.
 */
router.get("/submissions", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select("assignment_id")
      .eq("student_id", req.user.id);

    if (error) throw error;

    const submittedIds = (data || []).map((r) => r.assignment_id);
    res.json({ submittedIds });
  } catch (err) {
    console.error("Submissions error:", err.message);
    res.status(500).json({ error: "Failed to fetch submissions." });
  }
});

/**
 * GET /api/assignments/:id/submissions
 * Get all submissions for a specific assignment (teacher only).
 */
router.get("/:id/submissions", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const assignmentId = req.params.id;

    // Verify it belongs to this teacher
    const { data: assign, error: assignErr } = await supabaseAdmin
      .from("assignments")
      .select("id")
      .eq("id", assignmentId)
      .eq("teacher_id", req.user.id)
      .maybeSingle();

    if (assignErr) throw assignErr;
    if (!assign) return res.status(404).json({ error: "Assignment not found or access denied." });

    // Fetch submissions with student info from users
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select(`
        id, 
        file_url, 
        submitted_at, 
        student_id,
        users!student_id(full_name, first_name, last_name, course)
      `)
      .eq("assignment_id", assignmentId)
      .order("submitted_at", { ascending: false });

    if (error) throw error;
    res.json({ submissions: data || [] });
  } catch (err) {
    console.error("Fetch assignment submissions error:", err.message);
    res.status(500).json({ error: "Failed to fetch assignment submissions." });
  }
});

/**
 * POST /api/assignments/:id/submit
 * Student submits a file for an assignment.
 */
router.post("/:id/submit", authenticate, uploadLimiter, (req, res, next) => {
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
    const assignmentId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ error: "File is required." });
    }

    // Upload to Supabase Storage
    const ext = req.file.originalname.split(".").pop();
    const fileName = `submissions/${req.user.id}/${assignmentId}/${Date.now()}.${ext}`;

    const { error: storageErr } = await supabaseAdmin.storage
      .from("submissions")
      .upload(fileName, req.file.buffer, { upsert: false });

    if (storageErr) throw new Error("Storage: " + storageErr.message);

    const { data: urlData } = supabaseAdmin.storage.from("submissions").getPublicUrl(fileName);
    const fileUrl = urlData?.publicUrl || "";

    // Insert submission record
    const { error: dbErr } = await supabaseAdmin.from("submissions").insert({
      assignment_id: assignmentId,
      student_id: req.user.id,
      file_url: fileUrl,
      submitted_at: new Date().toISOString(),
    });

    if (dbErr) throw new Error("Database: " + dbErr.message);

    res.status(201).json({ message: "Assignment submitted successfully." });
  } catch (err) {
    console.error("Submit assignment error:", err.message);
    res.status(500).json({ error: err.message || "Submission failed." });
  }
});

module.exports = router;
