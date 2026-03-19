/**
 * routes/sync.js
 * Consolidated sync endpoint for ultra-scalable caching.
 * Fetches all necessary dashboard data in a single request, heavily leveraging in-memory cache to minimize database hits.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate } = require("../middleware/auth");
const { getOrSet } = require("../lib/cache");

/**
 * GET /api/sync
 * Returns a massive JSON payload containing all state required for the dashboard.
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    const syncData = { profile: null, stats: null };

    // 1. Always fetch Profile (direct, user-specific)
    const { data: profileObj } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
    
    syncData.profile = profileObj || { id: userId, email: req.user.email, role };

    // 2. Role-specific aggregations
    if (role === "teacher") {
      const cacheKey = `stats:teacher:${userId}`;
      const stats = await getOrSet(cacheKey, async () => {
        const [studentsRes, notesRes, assignmentsRes] = await Promise.all([
          supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
          supabaseAdmin.from("notes").select("id", { count: "exact", head: true }).eq("teacher_id", userId),
          supabaseAdmin.from("assignments").select("id", { count: "exact", head: true }).eq("teacher_id", userId),
        ]);
        const { data: subjectRows } = await supabaseAdmin.from("notes").select("subject").eq("teacher_id", userId);
        const uniqueSubjects = new Set((subjectRows || []).map((r) => r.subject).filter(Boolean));
        return {
          students: studentsRes.count ?? 0,
          notes: notesRes.count ?? 0,
          assignments: assignmentsRes.count ?? 0,
          courses: uniqueSubjects.size,
        };
      }, 60);
      syncData.stats = stats;

      // Teacher specific parallel fetches (ONLY DASHBOARD)
      const [ recentNotesRes, recentAssignmentsRes ] = await Promise.all([
        supabaseAdmin.from("notes").select("*, users!inner(full_name, first_name, last_name, email)").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(5),
        supabaseAdmin.from("assignments").select("*, users!inner(full_name, first_name, last_name, email)").eq("teacher_id", userId).order("created_at", { ascending: false }).limit(5)
      ]);

      syncData.recentNotes = recentNotesRes.data || [];
      syncData.recentAssignments = recentAssignmentsRes.data || [];

    } else if (role === "student") {
      const cacheKey = `stats:student:${userId}`;
      const stats = await getOrSet(cacheKey, async () => {
        let notesQuery = supabaseAdmin.from("notes").select("id", { count: "exact", head: true });
        if (profileObj.course) notesQuery = notesQuery.ilike("course", profileObj.course);

        const [coursesRes, notesRes, assignmentsRes] = await Promise.all([
          supabaseAdmin.from("courses").select("id", { count: "exact", head: true }),
          notesQuery,
          supabaseAdmin.from("assignments").select("id", { count: "exact", head: true }),
        ]);
        const { data: submittedRows } = await supabaseAdmin.from("submissions").select("assignment_id").eq("student_id", userId);
        const submittedCount = (submittedRows || []).length;
        const pending = Math.max(0, (assignmentsRes.count ?? 0) - submittedCount);
        const { count: annCount } = await supabaseAdmin.from("announcements").select("id", { count: "exact", head: true });
        return {
          courses: coursesRes.count ?? 0,
          notes: notesRes.count ?? 0,
          pendingAssignments: pending,
          announcements: annCount ?? 0,
        };
      }, 60);
      syncData.stats = stats;

      // Calculate fee logic helper
      const calcFeeStatus = (historyData, pProfile) => {
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = today.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        const currentRecord = (historyData || []).find((r) => r.month === currentMonth);
        const status = currentRecord ? currentRecord.status : (pProfile?.fees_status || "unpaid");
        let dueDateStr = null;
        if (currentRecord?.status === "paid") dueDateStr = null;
        else dueDateStr = `${currentMonth}-05`;
        const showReminder = status !== "paid" && today.getDate() > 5;
        return {
            fee: {
                status,
                amount: currentRecord?.amount || null,
                due_date: dueDateStr,
                paid_at: currentRecord?.paid_at || null,
            },
            showReminder,
            currentMonth: monthLabel
        };
      };

      // Student parallel fetches (ONLY DASHBOARD)
      const [
        recentNotesRes,
        recentAssignmentsRes,
        submissionsRes,
        attSummaryRes,
        rawFeeHistoryRes
      ] = await Promise.all([
        getOrSet(`notes:recent:${profileObj.course || 'all'}`, async () => { 
          let q = supabaseAdmin.from("notes").select("*").order("created_at", { ascending: false }).limit(5);
          if (profileObj.course) q = q.ilike("course", profileObj.course);
          const { data } = await q; 
          return data || []; 
        }, 60),
        getOrSet("assignments:recent", async () => { const { data } = await supabaseAdmin.from("assignments").select("*").order("created_at", { ascending: false }).limit(5); return data || []; }, 60),
        supabaseAdmin.from("submissions").select("assignment_id").eq("student_id", userId),
        supabaseAdmin.from("attendance_records").select("status").eq("student_id", userId),
        supabaseAdmin.from("fee_payments").select("*").eq("student_id", userId).order("month", { ascending: false })
      ]);

      // Calculate attendance
      const records = attSummaryRes.data || [];
      const total = records.length;
      const present = records.filter((r) => r.status === "present").length;
      const absent = records.filter((r) => r.status === "absent").length;
      const pct = total === 0 ? 0 : Math.round((present / total) * 100);

      syncData.recentNotes = recentNotesRes;
      syncData.recentAssignments = recentAssignmentsRes;
      syncData.submittedIds = (submissionsRes.data || []).map(r => r.assignment_id);
      syncData.attendanceSummary = { total, present, absent, pct };
      const feeHistory = rawFeeHistoryRes.data || [];
      syncData.feeStatus = calcFeeStatus(feeHistory, syncData.profile);
    }

    res.json(syncData);
  } catch (err) {
    console.error("Sync fetch error:", err.message);
    res.status(500).json({ error: "Failed to sync state." });
  }
});

module.exports = router;
