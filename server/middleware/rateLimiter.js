/**
 * middleware/rateLimiter.js
 * Rate limiting configuration for different endpoint groups.
 */

const rateLimit = require("express-rate-limit");


// Global rate limiter — 100 requests per 15 minutes per IP.
 
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in 15 minutes." },
});

/**
 * Auth rate limiter — 10 attempts per 15 minutes per IP.
 * Protects login, forgot-password, OTP verification from brute-force.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

/**
 * Upload rate limiter
 *  20 uploads per hour per IP.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload limit reached. Please try again after an Hour." },
});

module.exports = { globalLimiter, authLimiter, uploadLimiter };
