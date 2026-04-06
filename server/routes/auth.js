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

    // Fetch user profile from profiles table
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
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
      await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        first_name: user.user_metadata?.first_name || null,
        last_name: user.user_metadata?.last_name || null,
        role: role,
        class: user.user_metadata?.course || user.user_metadata?.class || null,
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
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);
    }

    // --- Admin MFA Check ---
    if (role === "admin") {
      const factors = user.factors || [];
      const totpFactor = factors.find(f => f.factor_type === 'totp' && f.status === 'verified');
      
      if (totpFactor) {
        return res.json({
          requires_mfa: true,
          factorId: totpFactor.id,
          tempToken: session.access_token,
          refreshToken: session.refresh_token,
          message: "Please provide your Authenticator code.",
        });
      } else {
        return res.json({
          requires_mfa_setup: true,
          tempToken: session.access_token,
          refreshToken: session.refresh_token,
          message: "MFA Setup is required for Admin accounts.",
        });
      }
    }
    // -----------------------

    res.json({
      token: session.access_token,
      refreshToken: session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: userRole || role,
        full_name: profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "",
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
 * POST /api/auth/mfa/enroll
 * Enroll an admin in MFA (generate QR Code).
 */
router.post("/mfa/enroll", authenticate, async (req, res) => {
  try {
    const { createClient } = require("@supabase/supabase-js");
    const tempClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${req.token}` } },
      auth: { persistSession: false }
    });

    const { data, error } = await tempClient.auth.mfa.enroll({
      factorType: "totp",
      issuer: "DigitalStudyCenter"
    });

    if (error) {
       console.error("MFA Enroll Supabase error:", error);
       return res.status(400).json({ error: error.message || "Failed to enroll MFA." });
    }

    res.json({
      factorId: data.id,
      qr_code: data.totp.qr_code,
      uri: data.totp.uri,
      secret: data.totp.secret
    });
  } catch (err) {
    console.error("MFA enroll error:", err.message);
    res.status(500).json({ error: "Failed to initialize MFA setup." });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Verify an MFA code for the first time setup or subsequent login.
 */
router.post("/mfa/verify", authenticate, async (req, res) => {
  try {
    const { factorId, code } = req.body;
    if (!factorId || !code) {
      return res.status(400).json({ error: "Factor ID and verification code are required." });
    }

    const { createClient } = require("@supabase/supabase-js");
    const tempClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${req.token}` } },
      auth: { persistSession: false }
    });

    const challenge = await tempClient.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      console.error("MFA Challenge error:", challenge.error);
      return res.status(400).json({ error: challenge.error.message || "Failed to initiate MFA challenge." });
    }

    const verify = await tempClient.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code
    });

    if (verify.error) {
      console.error("MFA Verify error:", verify.error);
      return res.status(400).json({ error: verify.error.message || "Invalid OTP code." });
    }

    // Provide the upgraded session back to the client!
    // tempClient automatically updates its internal session upon successful MFA verify if the factor upgrades the AAL.
    // However, since we used persistSession: false and initialized via headers, the internal session might not be explicitly populated. 
    // Wait, mfa.verify DOES update the internal session if the auth was initialized properly. Let's return success, and the client will need to refresh their session!
    // Wait, let's refresh the session from the backend deliberately to give the client the new AAL2 tokens!
    // But we don't have the refresh token in req. So we just tell the client "success: true", and the client MUST call `/api/auth/refresh` with their old refresh token, which WILL return an AAL2 token!
    
    res.json({
      success: true,
      message: "MFA verified successfully. Please refresh your session.",
    });
  } catch (err) {
    console.error("MFA verify error:", err.message);
    res.status(500).json({ error: "Failed to verify MFA code." });
  }
});

/**
 * POST /api/auth/forgot-password
 * Send password reset email.
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
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        full_name: profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "",
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
