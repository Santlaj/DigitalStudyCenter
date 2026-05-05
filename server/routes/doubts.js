/**
 * routes/doubts.js
 * Doubt section routes. Cached with Redis.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate } = require("../middleware/auth");
const { getOrSet, invalidatePrefix } = require("../lib/cache");

/**
 * GET /api/doubts
 * List doubts. Students see their own; Teachers see all. Cached 60s.
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const cacheKey = req.user.role === "teacher"
      ? "doubts:all"
      : `doubts:student:${req.user.id}`;

    const data = await getOrSet(cacheKey, async () => {
      let q = supabaseAdmin
        .from("doubts")
        .select("*")
        .order("created_at", { ascending: false });

      // Students only see their own doubts
      if (req.user.role === "student") {
        q = q.eq("student_id", req.user.id);
      }

      const { data: doubts, error } = await q;
      if (error) throw error;
      
      if (doubts && doubts.length > 0) {
        const studentIds = [...new Set(doubts.map(d => d.student_id))];
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, class")
          .in("id", studentIds);
          
        const classMap = {};
        if (profiles) {
          profiles.forEach(p => { classMap[p.id] = p.class; });
        }
        
        doubts.forEach(d => {
          if (classMap[d.student_id]) {
            d.student_class = classMap[d.student_id];
          }
        });
      }
      
      return doubts || [];
    }, 60);

    res.json({ doubts: data });
  } catch (err) {
    console.error("Doubts list error:", err.message);
    res.status(500).json({ error: "Failed to fetch doubts." });
  }
});

/**
 * POST /api/doubts
 * Submit a new doubt (Student only).
 */
router.post("/", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can submit doubts." });
    }

    const { subject, question } = req.body;

    if (!subject || !question) {
      return res.status(400).json({ error: "Subject and question are required." });
    }

    // Directly fetch student name from profiles table (most reliable)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", req.user.id)
      .single();

    const studentName = profile?.full_name || req.user.fullName || req.user.email || "Student";

    const { data, error } = await supabaseAdmin
      .from("doubts")
      .insert({
        student_id: req.user.id,
        student_name: studentName,
        subject,
        question,
        status: "Pending"
      })
      .select()
      .single();

    if (error) throw error;

    // Invalidate caches
    invalidatePrefix("doubts:");

    res.status(201).json({ message: "Doubt submitted successfully.", doubt: data });
  } catch (err) {
    console.error("Submit doubt error:", err.message);
    res.status(500).json({ error: "Failed to submit doubt." });
  }
});

/**
 * PATCH /api/doubts/:id/reply
 * Reply to a doubt (Teacher only).
 */
router.patch("/:id/reply", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "teacher") {
      return res.status(403).json({ error: "Only teachers can reply to doubts." });
    }

    const { answer } = req.body;
    if (!answer) {
      return res.status(400).json({ error: "Answer is required." });
    }

    const { data, error } = await supabaseAdmin
      .from("doubts")
      .update({ answer, status: "Resolved" })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Invalidate caches
    invalidatePrefix("doubts:");

    res.json({ message: "Reply posted successfully.", doubt: data });
  } catch (err) {
    console.error("Reply doubt error:", err.message);
    res.status(500).json({ error: "Failed to reply to doubt." });
  }
});

module.exports = router;
