/**
 * server.js
 * DigitalStudyCenter — Express API Server
 * Main entry point.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { globalLimiter } = require("./middleware/rateLimiter");

const app = express();
const PORT = process.env.PORT || 3000;

/* ═══════════════════════════════════════════════════════
   GLOBAL MIDDLEWARE
═══════════════════════════════════════════════════════ */

// Security headers
app.use(helmet());

// CORS — allow client origin(s)
const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://santlaj.github.io",
  "https://digitalstudycenter.in",
  "https://www.digitalstudycenter.in",
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`CORS blocked origin: ${origin}`);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Request logging (dev mode = colored, production = combined)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Global rate limiter
app.use(globalLimiter);

// JSON body parser (limit 2MB for form data)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* ═══════════════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════════════ */

// Root route for health check (using multiple patterns for robustness)
app.get(["/", "/api", "/healthz"], (req, res) => {
  console.log(`Root/Health access: ${req.method} ${req.originalUrl}`);
  res.status(200).json({
    status: "online",
    message: "DigitalStudyCenter API is running.",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth"
    }
  });
});

app.use("/api/auth",          require("./routes/auth"));
app.use("/api/notes",         require("./routes/notes"));
app.use("/api/assignments",   require("./routes/assignments"));
app.use("/api/users",         require("./routes/users"));
app.use("/api/attendance",    require("./routes/attendance"));
app.use("/api/fees",          require("./routes/fees"));
app.use("/api/courses",       require("./routes/courses"));
app.use("/api/announcements", require("./routes/announcements"));
app.use("/api/analytics",     require("./routes/analytics"));

/* ═══════════════════════════════════════════════════════
   HEALTH CHECK
═══════════════════════════════════════════════════════ */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

/* ═══════════════════════════════════════════════════════
   404 HANDLER
═══════════════════════════════════════════════════════ */

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

/* ═══════════════════════════════════════════════════════
   ERROR HANDLER
═══════════════════════════════════════════════════════ */

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  console.error(err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error."
      : err.message,
  });
});

/* ═══════════════════════════════════════════════════════
   START SERVER
═══════════════════════════════════════════════════════ */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 DigitalStudyCenter API running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Client URL:  ${process.env.CLIENT_URL || "https://digitalstudycenter.in"}\n`);
});
