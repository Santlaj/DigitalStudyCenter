/**
 * lib/cache.js
 * Simple in-memory cache using node-cache.
 * Good enough for ≤1000 students. No external service needed.
 */

const NodeCache = require("node-cache");

// Default TTL: 60 seconds, check expired keys every 120s
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

/**
 * Get cached value or fetch + cache it.
 * @param {string} key   - Cache key
 * @param {Function} fetchFn - Async function to fetch data if cache miss
 * @param {number} ttl   - Time to live in seconds (default: 60)
 */
async function getOrSet(key, fetchFn, ttl = 60) {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const data = await fetchFn();
  cache.set(key, data, ttl);
  return data;
}

/**
 * Invalidate (delete) a specific cache key.
 */
function invalidate(key) {
  cache.del(key);
}

/**
 * Invalidate all keys matching a prefix.
 */
function invalidatePrefix(prefix) {
  const keys = cache.keys().filter((k) => k.startsWith(prefix));
  if (keys.length > 0) cache.del(keys);
}

/**
 * Clear entire cache.
 */
function clearAll() {
  cache.flushAll();
}

module.exports = { cache, getOrSet, invalidate, invalidatePrefix, clearAll };
