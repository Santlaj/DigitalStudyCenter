/**
 * JWT authentication middleware.
 * Validates the Supabase access token and attaches user info to req.
 */

const crypto = require("crypto");
const { supabaseAdmin } = require("../lib/supabase");
const redis = require("../lib/redis");

/**
 * Authenticate request using Bearer token.
 * Attaches req.user = { id, email, role }
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const cacheKey = `auth:session:${tokenHash}`;

    let authData = null;

    // 1. Try Redis Cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        authData = JSON.parse(cached);
        console.log(`[Auth Cache] ⚡ HIT: Supabase Auth Bypassed for ${authData.email}`);
      }
    } catch (e) { /* ignore redis err */ }

    // 2. Cache Miss: Fetch from Supabase
    if (!authData) {
      console.log(`[Auth Cache] 🐌 MISS: Fetching from Supabase...`);
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: "Invalid or expired token." });

      let aal = 'aal1';
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        aal = payload.aal || 'aal1';
      } catch (e) { }

      authData = {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || "student",
        fullName: user.user_metadata?.full_name || user.email,
        aal: aal
      };

      try {
        // Cache for 300 seconds (5 minutes)
        await redis.setex(cacheKey, 300, JSON.stringify(authData));
      } catch (e) { /* ignore redis err */ }
    }

    // 3. Attach cached auth info
    req.user = {
      id: authData.id,
      email: authData.email,
      role: authData.role,
      fullName: authData.fullName
    };
    req.aal = authData.aal;

    // 4. Lazy profile loader
    req.getProfile = async () => {
      if (req._profile !== undefined) return req._profile;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, full_name, class, subject, is_active")
        .eq("id", req.user.id)
        .single();
      req._profile = profile || null;
      if (profile) {
        req.user.role = profile.role || req.user.role;
        req.user.fullName = profile.full_name || req.user.fullName;
        req.user.course = profile.class || null;
        req.user.subject = profile.subject || null;
        req.user.is_active = profile.is_active !== false;
      }
      return req._profile;
    };

    if (req.user.role === "student") {
      await req.getProfile();
    }

    // MANDATORY MFA for teachers
    if (req.user.role === "teacher" && req.aal !== "aal2") {
      return res.status(403).json({ error: "Access denied. Multi-Factor Authentication is required." });
    }

    req.token = token;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    return res.status(401).json({ error: "Authentication failed." });
  }
}

/**
 * Role guard — use after authenticate().
 * @param  {...string} roles - Allowed roles for simple checking (not for admin)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated." });
    }
    // NEVER trust this simple metadata role for 'admin' privileges according to security rules.
    // This is strictly for 'student' or 'teacher' fallback.
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
