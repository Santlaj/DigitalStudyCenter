/**
 * routes/dashboard.js
 * Production-grade dashboard summary endpoint.
 * Limited recent items and aggregated counts only.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate } = require("../middleware/auth");
const { getOrSet } = require("../lib/cache");

router.get("/summary", authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    const cacheKey = `dashboard:summary:${role}:${userId}`;

    const data = await getOrSet(cacheKey, async () => {
      const summary = { stats: {}, recentNotes: [], recentAssignments: [] };

      // 1. Shared Profile Cache (already minimal)
      const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).single();
      summary.profile = profile;

      if (role === "teacher") {
        const [students, notes, assigns, recentNotes, recentAssigns] = await Promise.all([
          supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
          supabaseAdmin.from("notes").select("id", { count: "exact", head: true }).eq("teacher_id", userId),
          supabaseAdmin.from("assignments").select("id", { count: "exact", head: true }).eq("teacher_id", userId),
          supabaseAdmin.from("notes").select("id, title, subject, created_at").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(5),
          supabaseAdmin.from("assignments").select("id, title, subject, created_at").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(5),
        ]);

        summary.stats = {
          students: students.count || 0,
          notes: notes.count || 0,
          assignments: assigns.count || 0
        };
        summary.recentNotes = recentNotes.data || [];
        summary.recentAssignments = recentAssigns.data || [];

      } else {
        // Student role
        const course = profile?.course || null;
        let notesQuery = supabaseAdmin.from("notes").select("id", { count: "exact", head: true });
        if (course) notesQuery = notesQuery.ilike("course", course);

        const [notes, assigns, recentNotes, recentAssigns, attendance] = await Promise.all([
          notesQuery,
          supabaseAdmin.from("assignments").select("id", { count: "exact", head: true }),
          supabaseAdmin.from("notes").select("id, title, subject, created_at").order("created_at", { ascending: false }).limit(5),
          supabaseAdmin.from("assignments").select("id, title, subject, created_at").order("created_at", { ascending: false }).limit(5),
          supabaseAdmin.from("attendance_records").select("status").eq("student_id", userId),
        ]);

        // Attendance aggregation
        const attRecords = attendance.data || [];
        const present = attRecords.filter(r => r.status === "present").length;
        const total = attRecords.length;
        
        summary.stats = {
          notes: notes.count || 0,
          assignments: assigns.count || 0,
          attendancePct: total === 0 ? 0 : Math.round((present / total) * 100)
        };
        summary.recentNotes = recentNotes.data || [];
        summary.recentAssignments = recentAssigns.data || [];
      }

      return summary;
    }, 300); // 5 minute cache

    res.json(data);
  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).json({ error: "Failed to fetch dashboard summary." });
  }
});

module.exports = router;
