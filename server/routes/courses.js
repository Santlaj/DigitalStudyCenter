/**
 * routes/courses.js
 * Course listing routes. Cached.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate } = require("../middleware/auth");
const { getOrSet } = require("../lib/cache");

/**
 * GET /api/courses
 * List all courses with teacher info. Cached 5 min.
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const data = await getOrSet("courses:list", async () => {
      const { data, error } = await supabaseAdmin
        .from("courses")
        .select("*, users!teacher_id(full_name, first_name, last_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get note & assignment counts by subject
      const [{ data: noteAgg }, { data: assignAgg }] = await Promise.all([
        supabaseAdmin.from("notes").select("subject"),
        supabaseAdmin.from("assignments").select("subject"),
      ]);

      const noteCountMap = {};
      const assignCountMap = {};
      (noteAgg || []).forEach((n) => {
        noteCountMap[n.subject] = (noteCountMap[n.subject] || 0) + 1;
      });
      (assignAgg || []).forEach((a) => {
        assignCountMap[a.subject] = (assignCountMap[a.subject] || 0) + 1;
      });

      return (data || []).map((c) => ({
        ...c,
        notes_count: noteCountMap[c.title] || 0,
        assignments_count: assignCountMap[c.title] || 0,
      }));
    }, 300); // 5 min cache

    res.json({ courses: data, count: data.length });
  } catch (err) {
    console.error("Courses error:", err.message);
    res.status(500).json({ error: "Failed to fetch courses." });
  }
});

module.exports = router;
