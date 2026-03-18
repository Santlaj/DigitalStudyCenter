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
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    // Fetch role from users table
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("role, full_name, first_name, last_name")
      .eq("id", user.id)
      .single();

    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || user.user_metadata?.role || "student",
      fullName: profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || user.email,
    };

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
    next();
  };
}

module.exports = { authenticate, requireRole };
