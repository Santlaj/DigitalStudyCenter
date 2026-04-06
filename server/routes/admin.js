/**
 * routes/admin.js
 * Admin portal backend routes for managing the system.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate, requireRole } = require("../middleware/auth");
const { invalidatePrefix } = require("../lib/cache");

// Apply authentication and role check for all admin routes
router.use(authenticate, requireRole("admin"));

/**
 * GET /api/admin/stats
 * Platform-wide statistics.
 */
router.get("/stats", async (req, res) => {
  try {
    const [teachersRes, studentsRes, coursesRes, announcementsRes] = await Promise.all([
      supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "teacher"),
      supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
      supabaseAdmin.from("courses").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("announcements").select("id", { count: "exact", head: true })
    ]);

    res.json({
      teachersCount: teachersRes.count || 0,
      studentsCount: studentsRes.count || 0,
      coursesCount: coursesRes.count || 0,
      announcementsCount: announcementsRes.count || 0,
    });
  } catch (err) {
    console.error("Admin stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch platform stats." });
  }
});

/**
 * GET /api/admin/teachers
 * Retrieve the list of all teachers.
 */
router.get("/teachers", async (req, res) => {
  try {
    const { data: teachers, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("role", "teacher")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ teachers: teachers || [] });
  } catch (err) {
    console.error("Fetch teachers error:", err.message);
    res.status(500).json({ error: "Failed to fetch teachers." });
  }
});

/**
 * POST /api/admin/teachers
 * Add a new teacher to the system.
 */
router.post("/teachers", async (req, res) => {
  try {
    const { email, password, first_name, last_name, subject } = req.body;
    const fullName = `${first_name} ${last_name}`.trim();

    // Create auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, full_name: fullName, role: "teacher" },
    });

    if (authErr) throw authErr;

    // Optional: add initial subject to profiles
    if (subject) {
      await supabaseAdmin.from("profiles").update({ subject }).eq("id", authData.user.id);
    }

    res.status(201).json({ message: "Teacher added successfully." });
  } catch (err) {
    console.error("Add teacher error:", err.message);
    res.status(500).json({ error: err.message || "Failed to add teacher." });
  }
});

/**
 * DELETE /api/admin/teachers/:id
 * Remove or deactivate a teacher.
 */
router.delete("/teachers/:id", async (req, res) => {
  try {
    // Usually we just mark them inactive rather than deleting their entire audit trail
    // But if you want full deletion:
    // await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: false })
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ message: "Teacher deactivated." });
  } catch (err) {
    console.error("Deactivate teacher error:", err.message);
    res.status(500).json({ error: "Failed to deactivate teacher." });
  }
});

/**
 * GET /api/admin/activities
 * Minimal implementation: Fetch recent logged events from the system (e.g. recently uploaded notes)
 */
router.get("/activities", async (req, res) => {
  try {
    // For now, let's fetch recently created profiles and notes as a unified 'activities' stream
    const [notesRes, studentsRes] = await Promise.all([
      supabaseAdmin.from("notes").select("id, title, created_at, teacher_id").order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("profiles").select("id, full_name, role, created_at").order("created_at", { ascending: false }).limit(10)
    ]);

    const activities = [
      ...(notesRes.data || []).map(n => ({ type: "Note Uploaded", description: `Note: ${n.title}`, date: n.created_at })),
      ...(studentsRes.data || []).map(s => ({ type: "User Joined", description: `${s.full_name} joined as ${s.role}`, date: s.created_at }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

    res.json({ activities });
  } catch(err) {
     res.status(500).json({ error: "Failed to fetch activities" })
  }
});

module.exports = router;
