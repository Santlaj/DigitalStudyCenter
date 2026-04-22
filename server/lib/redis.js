/**
 * lib/redis.js
 * Redis client integration utilizing ioredis.
 * Includes fallback logic to prevent app crashes if Redis is unreachable.
 */

const Redis = require("ioredis");

let hasLoggedError = false;

// Fallback to local Redis if no environment variable provided
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  family: 4, // Force IPv4 to prevent Windows timeout issues
  tls: process.env.REDIS_URL?.includes("rediss://") ? { rejectUnauthorized: false } : undefined,
  retryStrategy: (times) => {
    // Attempt standard reconnects up to 3 times, then give up to avoid spam
    if (times > 3) {
      return null;
    }
    return Math.min(times * 50, 2000);
  },
  maxRetriesPerRequest: 1, // Fail fast if offline
});

redis.on("error", (err) => {
  if (!hasLoggedError) {
    console.warn("\n-----------------------------------------------------------");
    console.warn("⚠️ [Redis Warn] Caching layer is OFFLINE.");
    console.warn("Actual Error:", err.message);
    console.warn("Auth will gracefully fallback to Supabase API calls.");
    console.warn("-----------------------------------------------------------\n");
    hasLoggedError = true;
  }
});

redis.on("connect", () => {
  console.log("[Redis Info] Connected to caching layer successfully.");
  hasLoggedError = false;
});

module.exports = redis;
