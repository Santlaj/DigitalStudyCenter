/**
 * middleware/auth.js
 * JWT authentication middleware.
 * Validates the Supabase access token and attaches user info to req.
 */

const { supabaseAdmin } = require("../lib/supabase");

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
    // 1. Validate JWT and get user from Supabase Auth
    // Use auth.getUser(token) to check if token is still valid
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    // 2. Attach basic user info from JWT metadata
    req.user = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || "student",
      fullName: user.user_metadata?.full_name || user.email,
    };

    // 3. Lazy profile loader — only queries DB when actually needed
    // Teachers: skip profile query (JWT role is enough for most routes)
    // Students: load eagerly (need course for filtering notes/assignments)
    req.getProfile = async () => {
      if (req._profile !== undefined) return req._profile;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, full_name, class, subject, is_active")
        .eq("id", user.id)
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

    // Students always need profile (for course-based filtering)
    if (req.user.role === "student") {
      await req.getProfile();
    }

    // Parse JWT to extract AAL level (Authentication Assurance Level)
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      req.aal = payload.aal || 'aal1';
    } catch(e) {
      req.aal = 'aal1';
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
