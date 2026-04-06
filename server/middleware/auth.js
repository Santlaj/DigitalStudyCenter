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

    // 2. Attach basic user info from JWT metadata immediately
    // This reduces the need to query the profile table if only role is needed downstream
    req.user = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || "student",
      fullName: user.user_metadata?.full_name || user.email,
    };

    // 3. Optional: Fetch full profile ONLY if requested via a header or for specific routes
    // For now, we fetch it once and attach it, but we use the role from the JWT to avoid DB calls for role checks
    // This cache lasts for the duration of the Request object.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, full_name, class, subject, is_active")
      .eq("id", user.id)
      .single();

    if (profile) {
      req.user.role = profile.role || req.user.role;
      req.user.fullName = profile.full_name || req.user.fullName;
      req.user.course = profile.class || null;
      req.user.subject = profile.subject || null;
      req.user.is_active = profile.is_active !== false;
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
 * @param  {...string} roles - Allowed roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. Insufficient permissions." });
    }
    // Enforce MFA for Admin endpoints
    if (req.user.role === "admin" && req.aal !== "aal2") {
      return res.status(403).json({ error: "Admin access requires Two-Factor Authentication (MFA). Please complete 2FA." });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
