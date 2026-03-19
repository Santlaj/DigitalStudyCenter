/**
 * routes/analytics.js
 * Analytics data for teacher dashboard charts.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate, requireRole } = require("../middleware/auth");
const { getOrSet } = require("../lib/cache");

/**
 * GET /api/analytics/teacher
 * Teacher analytics — downloads, student activity, submissions by subject.
 * Cached 120s.
 */
router.get("/teacher", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const cacheKey = `analytics:teacher:${req.user.id}`;

    const data = await getOrSet(cacheKey, async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();

      const [
        { data: notesData },
        { data: studentData },
        { data: assignData },
      ] = await Promise.all([
        supabaseAdmin
          .from("notes")
          .select("created_at, download_count")
          .eq("teacher_id", req.user.id)
          .gte("created_at", since),
        supabaseAdmin
          .from("users")
          .select("created_at")
          .eq("role", "student")
          .gte("created_at", since),
        supabaseAdmin
          .from("assignments")
          .select("subject")
          .eq("teacher_id", req.user.id),
      ]);

      // Build labels for last 7 days
      const labels = [];
      for (let i = 6; i >= 0; i--) {
        labels.push(new Date(Date.now() - i * 86400000).toDateString());
      }

      // Downloads per day
      const downloadCounts = labels.map((day) => {
        return (notesData || [])
          .filter((n) => new Date(n.created_at).toDateString() === day)
          .reduce((s, n) => s + (n.download_count || 0), 0);
      });

      // New students per day
      const activityCounts = labels.map((day) => {
        return (studentData || [])
          .filter((s) => new Date(s.created_at).toDateString() === day).length;
      });

      // Assignments by subject
      const subjectMap = {};
      (assignData || []).forEach((a) => {
        if (a.subject) subjectMap[a.subject] = (subjectMap[a.subject] || 0) + 1;
      });

      // Format labels for display
      const displayLabels = labels.map((d) =>
        new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })
      );

      return {
        labels: displayLabels,
        downloads: downloadCounts,
        studentActivity: activityCounts,
        subjectLabels: Object.keys(subjectMap),
        subjectValues: Object.values(subjectMap),
      };
    }, 120);

    res.json(data);
  } catch (err) {
    console.error("Analytics error:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics." });
  }
});

/**
 * GET /api/analytics/student
 * Student analytics — weekly downloads and submissions.
 * Cached 120s.
 */
router.get("/student", authenticate, async (req, res) => {
  try {
    const cacheKey = `analytics:student:${req.user.id}`;

    const data = await getOrSet(cacheKey, async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();

      const [{ data: downloads }, { data: submissions }] = await Promise.all([
        supabaseAdmin
          .from("downloads")
          .select("downloaded_at")
          .eq("student_id", req.user.id)
          .gte("downloaded_at", since),
        supabaseAdmin
          .from("submissions")
          .select("submitted_at")
          .eq("student_id", req.user.id)
          .gte("submitted_at", since),
      ]);

      const labels = [];
      for (let i = 6; i >= 0; i--) {
        labels.push(new Date(Date.now() - i * 86400000).toDateString());
      }

      const downloadCounts = labels.map((day) =>
        (downloads || []).filter((d) => new Date(d.downloaded_at).toDateString() === day).length
      );

      const submissionCounts = labels.map((day) =>
        (submissions || []).filter((s) => new Date(s.submitted_at).toDateString() === day).length
      );

      const displayLabels = labels.map((d) =>
        new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })
      );

      return {
        labels: displayLabels,
        downloads: downloadCounts,
        submissions: submissionCounts,
      };
    }, 120);

    res.json(data);
  } catch (err) {
    console.error("Student analytics error:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics." });
  }
});

module.exports = router;
