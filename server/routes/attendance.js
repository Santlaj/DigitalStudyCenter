/**
 * routes/attendance.js
 * Attendance routes — sessions, records, student view.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate, requireRole } = require("../middleware/auth");
const { saveAttendanceRules } = require("../middleware/validate");
const { getOrSet, invalidatePrefix } = require("../lib/cache");

/**
 * GET /api/attendance/student
 * Student's attendance overview — sessions + records.
 */
router.get("/student", authenticate, async (req, res) => {
  try {
    // Get all sessions
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from("attendance_sessions")
      .select("id, subject, date, class_name")
      .order("date", { ascending: false });

    if (sessErr) throw sessErr;

    if (!sessions || !sessions.length) {
      return res.json({ sessions: [], records: [], summary: {} });
    }

    const sessionIds = sessions.map((s) => s.id);

    // Get student's records for those sessions
    const { data: records, error: recErr } = await supabaseAdmin
      .from("attendance_records")
      .select("session_id, status, note")
      .eq("student_id", req.user.id)
      .in("session_id", sessionIds);

    if (recErr) throw recErr;

    // Build summary
    const recordMap = {};
    (records || []).forEach((r) => { recordMap[r.session_id] = r; });

    // Filter sessions to only those where the student has a record
    const mySessions = sessions.filter(s => recordMap[s.id]);

    let present = 0, absent = 0, late = 0, total = mySessions.length;
    mySessions.forEach((s) => {
      const r = recordMap[s.id];
      if (r) {
        if (r.status === "present") present++;
        else if (r.status === "absent") absent++;
        else if (r.status === "late") { late++; present++; } // late counts as present
      }
    });

    const pct = total > 0 ? Math.round((present / total) * 100) : 0;

    // Subject breakdown
    const subjectMap = {};
    mySessions.forEach((s) => {
      if (!subjectMap[s.subject]) {
        subjectMap[s.subject] = { total: 0, present: 0, absent: 0, late: 0 };
      }
      subjectMap[s.subject].total++;
      const r = recordMap[s.id];
      if (r) {
        if (r.status === "present") subjectMap[s.subject].present++;
        else if (r.status === "absent") subjectMap[s.subject].absent++;
        else if (r.status === "late") { subjectMap[s.subject].late++; subjectMap[s.subject].present++; }
      }
    });

    const subjects = Object.entries(subjectMap).map(([name, data]) => ({
      name,
      ...data,
      pct: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
    }));

    // Recent classes (last 20)
    const recent = mySessions.slice(0, 20).map((s) => ({
      ...s,
      status: recordMap[s.id]?.status || "no-record",
      note: recordMap[s.id]?.note || "",
    }));

    res.json({
      summary: { present, absent, late, total, pct },
      subjects,
      recent,
    });
  } catch (err) {
    console.error("Student attendance error:", err.message);
    res.status(500).json({ error: "Failed to fetch attendance." });
  }
});

/**
 * GET /api/attendance/sessions
 * Teacher's attendance session history.
 */
router.get("/sessions", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("attendance_sessions")
      .select("*")
      .eq("teacher_id", req.user.id)
      .order("date", { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ sessions: data || [] });
  } catch (err) {
    console.error("Attendance sessions error:", err.message);
    res.status(500).json({ error: "Failed to fetch attendance sessions." });
  }
});

/**
 * POST /api/attendance/sessions
 * Save a new attendance session with records (teacher only).
 */
router.post("/sessions", authenticate, requireRole("teacher"), saveAttendanceRules, async (req, res) => {
  try {
    const { date, class_name, subject, records } = req.body;

    // Create session
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("attendance_sessions")
      .insert({
        teacher_id: req.user.id,
        date,
        class_name,
        subject,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessErr) throw sessErr;

    // Insert records
    const recordRows = records.map((r) => ({
      session_id: session.id,
      student_id: r.student_id,
      status: r.status, // present, absent, late
      note: r.note || null,
    }));

    const { error: recErr } = await supabaseAdmin
      .from("attendance_records")
      .insert(recordRows);

    if (recErr) throw recErr;

    invalidatePrefix("attendance:");
    res.status(201).json({ message: "Attendance saved.", session });
  } catch (err) {
    console.error("Save attendance error:", err.message);
    res.status(500).json({ error: err.message || "Failed to save attendance." });
  }
});

/**
 * GET /api/attendance/sessions/:id/records
 * Get detailed records for a specific session.
 */
router.get("/sessions/:id/records", authenticate, async (req, res) => {
  try {
    const { data: session } = await supabaseAdmin
      .from("attendance_sessions")
      .select("*")
      .eq("id", req.params.id)
      .single();

    const { data: records, error } = await supabaseAdmin
      .from("attendance_records")
      .select("*, users!student_id(full_name, first_name, last_name, email)")
      .eq("session_id", req.params.id);

    if (error) throw error;

    res.json({ session, records: records || [] });
  } catch (err) {
    console.error("Session records error:", err.message);
    res.status(500).json({ error: "Failed to fetch session records." });
  }
});

/**
 * DELETE /api/attendance/sessions/:id
 * Delete an attendance session and its records (teacher only).
 */
router.delete("/sessions/:id", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    // Delete records first
    await supabaseAdmin
      .from("attendance_records")
      .delete()
      .eq("session_id", req.params.id);

    // Delete session
    const { error } = await supabaseAdmin
      .from("attendance_sessions")
      .delete()
      .eq("id", req.params.id)
      .eq("teacher_id", req.user.id);

    if (error) throw error;

    invalidatePrefix("attendance:");
    res.json({ message: "Attendance record deleted." });
  } catch (err) {
    console.error("Delete attendance error:", err.message);
    res.status(500).json({ error: "Failed to delete attendance record." });
  }
});

/**
 * GET /api/attendance/students-for-class
 * Get students for a specific class (for attendance marking).
 */
router.get("/students-for-class", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from("users")
      .select("id, full_name, first_name, last_name, email, course")
      .eq("role", "student")
      .eq("is_active", true);

    if (req.query.class) {
      // The frontend sends "10", we can match it directly or use ilike if "Class 10" is used
      query = query.ilike("course", `%${req.query.class}%`);
    }

    const { data, error } = await query.order("full_name", { ascending: true });

    if (error) throw error;
    
    // Fetch unique subjects if a class is provided
    let uniqueSubjects = [];
    if (req.query.class) {
      const { data: subjData, error: subjErr } = await supabaseAdmin
        .from("subjects")
        .select("name")
        .eq("class_level", req.query.class);
        
      if (!subjErr && subjData) {
        uniqueSubjects = [...new Set(subjData.map(s => String(s.name).toLowerCase()))];
      }
    }

    res.json({ students: data || [], subjects: uniqueSubjects });
  } catch (err) {
    console.error("Students for class error:", err.message);
    res.status(500).json({ error: "Failed to fetch students." });
  }
});

module.exports = router;
