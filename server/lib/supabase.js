/**
 * lib/supabase.js
 * Server-side Supabase client initialization.
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment");
  process.exit(1);
}

// Ensure the Service Role key is actually different from the Anon key
if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY === SUPABASE_ANON_KEY) {
  console.error("❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is identical to SUPABASE_ANON_KEY.");
  console.error("   You accidentally pasted the Anon Key into the Service Role Key field!");
  console.error("   Please fix your environment variables on Render.");
  process.exit(1);
}

/**
 * Admin client — uses service_role key.
 * Bypasses RLS. Use only for admin operations.
 */
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Create a per-request Supabase client using the user's JWT.
 * This respects RLS policies.
 */
function supabaseClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = { supabaseAdmin, supabaseClient };
