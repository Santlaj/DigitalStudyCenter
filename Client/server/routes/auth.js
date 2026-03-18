/**
 * routes/auth.js
 * Authentication routes — login, forgot password, OTP, reset.
 */

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../lib/supabase");
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  loginRules,
  forgotPasswordRules,
  verifyOtpRules,
  resetPasswordRules,
} = require("../middleware/validate");

/**
 * POST /api/auth/login
 * Login with email + password. Returns JWT + user profile.
 */
router.post("/login", authLimiter, loginRules, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Create a temporary, stateless client so we don't accidentally log in the global `supabaseAdmin` object
    // If we use supabaseAdmin here, its internal state becomes polluted with this user's session permanently.
    const { createClient } = require("@supabase/supabase-js");
    const tempClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Sign in with Supabase Auth
    const { data, error } = await tempClient.auth.signInWithPassword({
      email,
      password,
    });

    // DEBUG — see exact Supabase response
    console.log("Supabase error:", error ? JSON.stringify(error) : "none");
    console.log("Supabase user:", data?.user?.id || "no user returned");
    console.log("=== END DEBUG ===");

    if (error) {
      return res.status(401).json({ error: error.message || "Invalid credentials." });
    }

    const { user, session } = data;

    // Fetch user profile from users table
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    // Check role matches
    const userRole = profile?.role || user.user_metadata?.role;
    if (userRole && userRole !== role) {
      return res.status(403).json({ error: "You are not allowed to login here." });
    }

    // Upsert to ensure users table has an entry and updates last_activity
    if (!profile) {
      // No profile exists, create one with the requested role
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, role }
      });
      await supabaseAdmin.from("users").upsert({
        id: user.id,
        email: user.email,
        role: role,
        full_name: user.user_metadata?.full_name || null,
        first_name: user.user_metadata?.first_name || null,
        last_name: user.user_metadata?.last_name || null,
        is_active: true,
        last_activity: new Date().toISOString(),
        created_at: new Date().toISOString()
      }, { onConflict: "id" });
    } else {
      // Profile exists, just update last activity
      // Also sync role if it was missing 
      const updateData = { last_activity: new Date().toISOString() };
      if (!profile.role) updateData.role = role;
      
      await supabaseAdmin
        .from("users")
        .update(updateData)
        .eq("id", user.id);
    }

    res.json({
      token: session.access_token,
      refreshToken: session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: userRole || role,
        full_name: profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || user.email,
        first_name: profile?.first_name || "",
        last_name: profile?.last_name || "",
        course: profile?.course || "",
        bio: profile?.bio || "",
        subject: profile?.subject || "",
        is_active: profile?.is_active !== false,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

/**
 * POST /api/auth/forgot-password
 * Send password reset email.
 */
router.post("/forgot-password", authLimiter, forgotPasswordRules, async (req, res) => {
  try {
    const { email } = req.body;
    const redirectTo = `${process.env.CLIENT_URL || "http://localhost:5500"}/?reset=true`;

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      return res.status(400).json({ error: error.message || "Failed to send reset email." });
    }

    res.json({ message: "Verification code sent to your email." });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ error: "Failed to send reset email." });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verify the 6-digit OTP from reset email.
 */
router.post("/verify-otp", authLimiter, verifyOtpRules, async (req, res) => {
  try {
    const { email, otp } = req.body;

    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      email,
      token: otp,
      type: "recovery",
    });

    if (error) {
      return res.status(400).json({ error: error.message || "Invalid or expired code." });
    }

    // Return a session token so the user can update their password
    res.json({
      message: "Code verified successfully.",
      token: data.session?.access_token || null,
    });
  } catch (err) {
    console.error("OTP verify error:", err.message);
    res.status(500).json({ error: "Verification failed." });
  }
});

/**
 * POST /api/auth/reset-password
 * Update password after OTP verification. Requires valid session token.
 */
router.post("/reset-password", authenticate, resetPasswordRules, async (req, res) => {
  try {
    const { password } = req.body;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password,
    });

    if (error) {
      return res.status(400).json({ error: error.message || "Failed to update password." });
    }

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ error: "Failed to update password." });
  }
});

/**
 * GET /api/auth/session
 * Check if the current token is valid. Returns user profile.
 */
router.get("/session", authenticate, async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", req.user.id)
      .single();

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        full_name: profile?.full_name || req.user.fullName,
        first_name: profile?.first_name || "",
        last_name: profile?.last_name || "",
        course: profile?.course || "",
        bio: profile?.bio || "",
        subject: profile?.subject || "",
        is_active: profile?.is_active !== false,
        fees_status: profile?.fees_status || "",
      },
    });
  } catch (err) {
    console.error("Session check error:", err.message);
    res.status(500).json({ error: "Session check failed." });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh the access token using a refresh token.
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required." });
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      return res.status(401).json({ error: "Failed to refresh session." });
    }

    res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (err) {
    console.error("Refresh error:", err.message);
    res.status(500).json({ error: "Token refresh failed." });
  }
});

module.exports = router;
