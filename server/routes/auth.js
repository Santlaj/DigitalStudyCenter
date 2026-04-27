/**
 * routes/auth.js
 * Authentication routes — login, session, forgot password, OTP, reset, refresh.
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
 * Sign in with email + password. Returns JWT tokens + user profile.
 */
router.post("/login", authLimiter, loginRules, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Create a temporary stateless client to avoid polluting supabaseAdmin's session
    const { createClient } = require("@supabase/supabase-js");
    const tempClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Authenticate with Supabase
    const { data, error } = await tempClient.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase returns "User is banned" when ban_duration is set (i.e. student is deactivated).
      // Replace with a friendlier message so students understand the situation.
      const msg = error.message?.toLowerCase().includes("banned")
        ? "Your account has been deactivated.\n Please contact your teacher to reactivate it."
        : (error.message || "Invalid credentials.");
      return res.status(401).json({ error: msg });
    }

    const { user, session } = data;

    // Fetch existing profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Determine role: trust DB first, then auth metadata, then client-provided role
    const actualRole = profile?.role || user.user_metadata?.role || role;

    // Create profile if first login
    if (!profile) {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, role: actualRole }
      });
      await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        first_name: user.user_metadata?.first_name || null,
        last_name: user.user_metadata?.last_name || null,
        role: actualRole,
        class: user.user_metadata?.course || user.user_metadata?.class || null,
        is_active: true,
        last_activity: new Date().toISOString(),
        created_at: new Date().toISOString()
      }, { onConflict: "id" });
    } else {
      // Update last activity timestamp
      await supabaseAdmin.from("profiles")
        .update({ last_activity: new Date().toISOString() })
        .eq("id", user.id);
    }

    // Build full name from available fields
    const fullName = profile?.full_name
      || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()
      || "";

    // MFA Enforcement for Teachers (AAL2 upgrade requirement)
    if (actualRole === "teacher") {
      // Initiate a temporary session client
      await tempClient.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      const { data: mfaData } = await tempClient.auth.mfa.listFactors();
      
      const totpFactors = mfaData?.all?.filter(f => f.factor_type === 'totp' && f.status === 'verified') || [];

      if (totpFactors.length > 0) {
        // Already enrolled
        return res.json({
          requireMfa: true,
          mfaSetup: false,
          tempToken: session.access_token,
          tempRefreshToken: session.refresh_token,
          factorId: totpFactors[0].id
        });
      } else {
        // First time setup - Enroll automatically
        const { data: enrollData, error: enrollError } = await tempClient.auth.mfa.enroll({ factorType: 'totp' });
        
        if (enrollError) {
          console.error("MFA Enroll Error:", enrollError.message);
          return res.status(500).json({ error: "Failed to initialize secure authentication." });
        }
        
        return res.json({
          requireMfa: true,
          mfaSetup: true,
          secret: enrollData.totp.secret,
          factorId: enrollData.id,
          tempToken: session.access_token,
          tempRefreshToken: session.refresh_token
        });
      }
    }

    res.json({
      token: session.access_token,
      refreshToken: session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: actualRole,
        full_name: fullName,
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
 * POST /api/auth/verify-mfa
 * Verify a TOTP code, upgrading the login session to AAL2.
 */
router.post("/verify-mfa", authLimiter, async (req, res) => {
  try {
    const { tempToken, tempRefreshToken, factorId, code } = req.body;
    if (!tempToken || !factorId || !code) {
      return res.status(400).json({ error: "Missing required MFA verification parameters." });
    }

    const { createClient } = require("@supabase/supabase-js");
    const tempClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error: sessionError } = await tempClient.auth.setSession({ access_token: tempToken, refresh_token: tempRefreshToken });
    if (sessionError) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    // Verify OTP against the Supabase factor
    const { error: verifyError } = await tempClient.auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      return res.status(401).json({ error: verifyError.message || "Invalid or expired verification code." });
    }

    // Extract the new, upgraded AAL2 session
    const { data: sessionData, error: getSessionError } = await tempClient.auth.getSession();
    if (getSessionError || !sessionData.session) {
      return res.status(500).json({ error: "Failed to establish a secure session." });
    }

    const newSession = sessionData.session;
    const user = newSession.user;

    // Fetch user profile securely
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Mark as active since they successfully bypassed maximum security
    await supabaseAdmin.from("profiles")
      .update({ last_activity: new Date().toISOString() })
      .eq("id", user.id);

    const fullName = profile?.full_name
      || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()
      || "";

    res.json({
      token: newSession.access_token,
      refreshToken: newSession.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: profile?.role || "teacher",
        full_name: fullName,
        first_name: profile?.first_name || "",
        last_name: profile?.last_name || "",
        course: profile?.course || profile?.class || "",
        bio: profile?.bio || "",
        subject: profile?.subject || "",
        is_active: profile?.is_active !== false,
      },
    });
  } catch (err) {
    console.error("MFA Verify Error:", err.message);
    res.status(500).json({ error: "MFA Verification failed due to a server error." });
  }
});

/**
 * POST /api/auth/forgot-password
 * Send a password reset email with a verification code.
 */
router.post("/forgot-password", authLimiter, forgotPasswordRules, async (req, res) => {
  try {
    const { email } = req.body;
    const redirectTo = `${process.env.CLIENT_URL || "https://digitalstudycenter.in"}/?reset=true`;

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
 * Verify the 6-digit OTP from the reset email.
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
 * Set a new password. Requires a valid session token (from OTP verification).
 */
router.post("/reset-password", authenticate, resetPasswordRules, async (req, res) => {
  try {
    const { password } = req.body;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password });

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
 * Validate the current token and return the user's profile.
 */
router.get("/session", authenticate, async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    const fullName = profile?.full_name
      || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()
      || "";

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        full_name: fullName,
        first_name: profile?.first_name || "",
        last_name: profile?.last_name || "",
        course: profile?.class || req.user.course || "",
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
 * Exchange a refresh token for a new access token.
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
