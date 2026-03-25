/**
 * routes/users.js
 * User/profile management + student CRUD (teacher).
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate, requireRole } = require("../middleware/auth");
const { updateProfileRules, addStudentRules } = require("../middleware/validate");
const { getOrSet, invalidatePrefix } = require("../lib/cache");

/**
 * GET /api/users/profile
 * Get current user's full profile.
 */
router.get("/profile", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    const profile = data || {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    };

    res.json({ profile });
  } catch (err) {
    console.error("Get profile error:", err.message);
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

/**
 * PATCH /api/users/profile
 * Update current user's profile.
 */
router.patch("/profile", authenticate, updateProfileRules, async (req, res) => {
  try {
    const { first_name, last_name, bio, course, subject } = req.body;
    const fullName = `${first_name || ""} ${last_name || ""}`.trim();

    // Update Supabase Auth metadata
    await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      user_metadata: { first_name, last_name, full_name: fullName },
    });

    // Upsert users table
    const updateData = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      first_name: first_name || null,
      last_name: last_name || null,
      full_name: fullName || null,
      bio: bio || null,
      updated_at: new Date().toISOString(),
    };

    if (req.user.role === "student") {
      updateData.class = course || null;
    }
    if (req.user.role === "teacher") {
      updateData.subject = subject || null;
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(updateData, { onConflict: "id" });

    if (error) throw error;

    invalidatePrefix("users:");
    res.json({ message: "Profile updated successfully." });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ error: err.message || "Failed to update profile." });
  }
});

/**
 * GET /api/users/students
 * List all students (teacher only).
 */
router.get("/students", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const query = req.query.search || "";
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    let q = supabaseAdmin
      .from("profiles")
      .select("*, course:class", { count: "exact" })
      .eq("role", "student")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (query) {
      q = q.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`);
    }

    const { data: studentsList, count, error } = await q;
    if (error) throw error;

    let students = studentsList || [];

    // Dynamically attach the current month's fee status from fee_payments
    if (students.length > 0) {
      const today = new Date();
      const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const studentIds = students.map(s => s.id);

      const { data: fees } = await supabaseAdmin
        .from("fee_payments")
        .select("student_id, status")
        .in("student_id", studentIds)
        .eq("month", month);

      if (fees && fees.length > 0) {
        const feeMap = {};
        fees.forEach(f => { feeMap[f.student_id] = f.status; });
        students = students.map(s => ({
          ...s,
          fees_status: feeMap[s.id] || "unpaid"
        }));
      } else {
        students = students.map(s => ({ ...s, fees_status: "unpaid" }));
      }
    }

    res.json({ students, count: count || 0 });
  } catch (err) {
    console.error("Fetch students error:", err.message);
    res.status(500).json({ error: "Failed to fetch students." });
  }
});

/**
 * POST /api/users/students
 * Add a new student account (teacher only).
 * Uses service_role to create auth user.
 */
router.post("/students", authenticate, requireRole("teacher"), addStudentRules, async (req, res) => {
  try {
    const { email, password, first_name, last_name, course } = req.body;
    const fullName = `${first_name} ${last_name}`.trim();

    // Create auth user
    // The Database Trigger 'on_auth_user_created' will handle inserting into profiles and users tables automatically.
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, full_name: fullName, role: "student", course: course || null },
    });

    if (authErr) throw authErr;

    // Optional: Update profiles table if any additional fields are needed that aren't set by the trigger
    // or to ensure it's synced immediately for the response (though trigger is very fast)
    await supabaseAdmin.from("profiles").update({
      class: course || null
    }).eq("id", authData.user.id);

    if (course) {
      await supabaseAdmin.from("users").update({
        course: course
      }).eq("id", authData.user.id);
    }

    invalidatePrefix("users:");
    invalidatePrefix("dashboard:");
    res.status(201).json({ message: "Student added successfully." });
  } catch (err) {
    console.error("Add student error:", err.message);
    res.status(500).json({ error: err.message || "Failed to add student." });
  }
});

/**
 * PATCH /api/users/students/:id/status
 * Activate or deactivate a student (teacher only).
 */
router.patch("/students/:id/status", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const { is_active } = req.body;

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: !!is_active, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);

    if (error) throw error;

    invalidatePrefix("users:");
    invalidatePrefix("dashboard:");
    res.json({ message: `Student ${is_active ? "activated" : "deactivated"}.` });
  } catch (err) {
    console.error("Update student status error:", err.message);
    res.status(500).json({ error: "Failed to update student status." });
  }
});

/**
 * PATCH /api/users/students/:id/fees
 * Mark student fees as paid/unpaid (teacher only).
 */
router.patch("/students/:id/fees", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const { status } = req.body; // "paid" or "unpaid"

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ fees_status: status, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);

    if (error) throw error;

    // Sync to fee_payments and profiles
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    await supabaseAdmin.from("fee_payments").upsert({
      student_id: req.params.id,
      month,
      status: status,
      paid_at: status === "paid" ? new Date().toISOString() : null
    }, { onConflict: "student_id,month" });

    await supabaseAdmin.from("profiles").update({
      last_payment_month: status === "paid" ? month : null,
      is_active: status === "paid" ? true : undefined
    }).eq("id", req.params.id);

    invalidatePrefix("users:");
    invalidatePrefix("dashboard:");
    res.json({ message: `Fees marked as ${status}.` });
  } catch (err) {
    console.error("Update fees error:", err.message);
    res.status(500).json({ error: "Failed to update fees status." });
  }
});

/**
 * POST /api/users/students/auto-mark-inactive
 * Auto-mark students inactive if fees unpaid after 5th of month (teacher only).
 */
router.post("/students/auto-mark-inactive", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const today = new Date();
    if (today.getDate() < 5) {
      return res.json({ message: "No action needed before 5th of the month.", updated: 0 });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("role", "student")
      .neq("fees_status", "paid")
      .eq("is_active", true)
      .select("id");

    if (error) throw error;

    invalidatePrefix("users:");
    invalidatePrefix("dashboard:");
    res.json({ message: `${(data || []).length} students marked inactive.`, updated: (data || []).length });
  } catch (err) {
    console.error("Auto-mark inactive error:", err.message);
    res.status(500).json({ error: "Failed to auto-mark inactive." });
  }
});

/**
 * GET /api/users/dashboard-stats
 * Aggregated stats for dashboard. Cached 60s.
 */
router.get("/dashboard-stats", authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const cacheKey = `stats:${role}:${req.user.id}`;

    const stats = await getOrSet(cacheKey, async () => {
      if (role === "teacher") {
        const [studentsRes, notesRes, assignmentsRes] = await Promise.all([
          supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
          supabaseAdmin.from("notes").select("id", { count: "exact", head: true }).eq("teacher_id", req.user.id),
          supabaseAdmin.from("assignments").select("id", { count: "exact", head: true }).eq("teacher_id", req.user.id),
        ]);

        // Unique subjects
        const { data: subjectRows } = await supabaseAdmin
          .from("notes")
          .select("subject")
          .eq("teacher_id", req.user.id);
        const uniqueSubjects = new Set((subjectRows || []).map((r) => r.subject).filter(Boolean));

        return {
          students: studentsRes.count ?? 0,
          notes: notesRes.count ?? 0,
          assignments: assignmentsRes.count ?? 0,
          courses: uniqueSubjects.size,
        };
      } else {
        // Student stats
        const [coursesRes, notesRes, assignmentsRes] = await Promise.all([
          supabaseAdmin.from("courses").select("id", { count: "exact", head: true }),
          supabaseAdmin.from("notes").select("id", { count: "exact", head: true }),
          supabaseAdmin.from("assignments").select("id", { count: "exact", head: true }),
        ]);

        const { data: submittedRows } = await supabaseAdmin
          .from("submissions")
          .select("assignment_id")
          .eq("student_id", req.user.id);
        const submittedCount = (submittedRows || []).length;
        const pending = Math.max(0, (assignmentsRes.count ?? 0) - submittedCount);

        // Announcement count
        const { count: annCount } = await supabaseAdmin
          .from("announcements")
          .select("id", { count: "exact", head: true });

        return {
          courses: coursesRes.count ?? 0,
          notes: notesRes.count ?? 0,
          pendingAssignments: pending,
          announcements: annCount ?? 0,
        };
      }
    }, 60);

    res.json({ stats });
  } catch (err) {
    console.error("Dashboard stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats." });
  }
});

module.exports = router;
