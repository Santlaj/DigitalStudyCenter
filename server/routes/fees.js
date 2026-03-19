/**
 * routes/fees.js
 * Fee payment routes — student view + teacher management.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate, requireRole } = require("../middleware/auth");

/**
 * GET /api/fees/current
 * Student's current month fee status.
 */
router.get("/current", authenticate, async (req, res) => {
  try {
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const { data, error } = await supabaseAdmin
      .from("fee_payments")
      .select("*")
      .eq("student_id", req.user.id)
      .eq("month", month)
      .maybeSingle();

    if (error) throw error;

    // Check if reminder should show (after 5th of month and unpaid)
    const dayOfMonth = today.getDate();
    const showReminder = dayOfMonth >= 5 && (!data || data.status !== "paid");

    res.json({
      fee: data || { status: "unpaid", month },
      showReminder,
      currentMonth: today.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    });
  } catch (err) {
    console.error("Current fee error:", err.message);
    res.status(500).json({ error: "Failed to fetch fee status." });
  }
});

/**
 * GET /api/fees/history
 * Student's full fee payment history.
 */
router.get("/history", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("fee_payments")
      .select("*")
      .eq("student_id", req.user.id)
      .order("month", { ascending: false });

    if (error) throw error;
    res.json({ history: data || [], count: (data || []).length });
  } catch (err) {
    console.error("Fee history error:", err.message);
    res.status(500).json({ error: "Failed to fetch fee history." });
  }
});

/**
 * PATCH /api/fees/:studentId
 * Teacher marks fee as paid/unpaid for current month.
 */
router.patch("/:studentId", authenticate, requireRole("teacher"), async (req, res) => {
  try {
    const { status, amount } = req.body;
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const upsertData = {
      student_id: req.params.studentId,
      month,
      status: status || "paid",
      amount: amount || null,
    };

    if (status === "paid") {
      upsertData.paid_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from("fee_payments")
      .upsert(upsertData, { onConflict: "student_id,month" });

    if (error) throw error;

    // Sync to users table
    await supabaseAdmin
      .from("users")
      .update({ fees_status: status, updated_at: new Date().toISOString() })
      .eq("id", req.params.studentId);

    // Sync to profiles table
    await supabaseAdmin
      .from("profiles")
      .update({ 
        last_payment_month: status === "paid" ? month : null,
        is_active: status === "paid" ? true : undefined
      })
      .eq("id", req.params.studentId);

    res.json({ message: `Fee marked as ${status}.` });
  } catch (err) {
    console.error("Update fee error:", err.message);
    res.status(500).json({ error: "Failed to update fee." });
  }
});

module.exports = router;
