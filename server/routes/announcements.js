/**
 * routes/announcements.js
 * Announcements routes. Cached.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate } = require("../middleware/auth");
const { getOrSet, invalidatePrefix } = require("../lib/cache");

/**
 * GET /api/announcements
 * List all announcements. Cached 120s.
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const userCourse = (req.user.course || "all").toLowerCase();
    const data = await getOrSet(`announcements:list:${req.user.role}:${userCourse}`, async () => {
      // Step 1: Fetch announcements without relational join
      let q = supabaseAdmin
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (req.user.role === "student" && req.user.course) {
        q = q.or(`course.eq.all,course.eq.${userCourse},course.is.null`);
      }

      const { data: annList, error } = await q;

      if (error) throw error;
      if (!annList || annList.length === 0) return [];

      // Step 2: Fetch teacher names for all unique teacher_ids
      const teacherIds = [...new Set(annList.map(a => a.teacher_id).filter(Boolean))];
      let teacherMap = {};
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabaseAdmin
          .from("users")
          .select("id, full_name, first_name, last_name")
          .in("id", teacherIds);
        if (teachers) {
          teachers.forEach(t => { teacherMap[t.id] = t; });
        }
      }

      // Step 3: Merge teacher info into announcements
      return annList.map(a => ({
        ...a,
        users: teacherMap[a.teacher_id] || null
      }));
    }, 120);

    res.json({ announcements: data, count: data.length });
  } catch (err) {
    console.error("Announcements error:", err.message);
    res.status(500).json({ error: "Failed to fetch announcements." });
  }
});

/**
 * GET /api/announcements/count
 * Count for notification badge. Cached 60s.
 */
router.get("/count", authenticate, async (req, res) => {
  try {
    const userCourse = (req.user.course || "all").toLowerCase();
    const count = await getOrSet(`announcements:count:${req.user.role}:${userCourse}`, async () => {
      let q = supabaseAdmin
        .from("announcements")
        .select("id", { count: "exact", head: true });

      if (req.user.role === "student" && req.user.course) {
        q = q.or(`course.eq.all,course.eq.${userCourse},course.is.null`);
      }
      
      const { count: exactCount, error } = await q;

      if (error) throw error;
      return exactCount ?? 0;
    }, 60);

    res.json({ count });
  } catch (err) {
    console.error("Announcement count error:", err.message);
    res.status(500).json({ error: "Failed to fetch count." });
  }
});

/**
 * POST /api/announcements
 * Create a new announcement (Teacher only).
 */
router.post("/", authenticate, async (req, res) => {
  try {
    const { title, message, course } = req.body;
    
    const isTeacher = req.user.role === "teacher";
    if (!isTeacher) {
      return res.status(403).json({ error: "Only teachers can post announcements." });
    }
    
    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required." });
    }
    
    const courseVal = course ? course.toLowerCase() : "all";

    const { data, error } = await supabaseAdmin
      .from("announcements")
      .insert({
        title,
        message,
        course: courseVal,
        teacher_id: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    
    invalidatePrefix("announcements:");

    res.status(201).json({ message: "Announcement created successfully.", announcement: data });
  } catch (err) {
    console.error("Create announcement error:", err.message);
    res.status(500).json({ error: "Failed to create announcement." });
  }
});

module.exports = router;
