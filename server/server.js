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

// GLOBAL MIDDLEWARE
// Security headers
app.use(helmet());

// CORS — allow client origin(s)
const allowedOrigins = [
  process.env.CLIENT_URL,
  "https://santlaj.github.io",
  "https://digitalstudycenter.in",
  "https://www.digitalstudycenter.in",
  "https://localhost",
  "capacitor://localhost",
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

// ROUTES
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

const dashboardRouter = require("./routes/dashboard");
const authRouter = require("./routes/auth");
const notesRouter = require("./routes/notes");
const assignmentsRouter = require("./routes/assignments");
const usersRouter = require("./routes/users");
const attendanceRouter = require("./routes/attendance");
const feesRouter = require("./routes/fees");
const coursesRouter = require("./routes/courses");
const announcementsRouter = require("./routes/announcements");
const analyticsRouter = require("./routes/analytics");

app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/users", usersRouter);
app.use("/api/notes", notesRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/fees", feesRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/analytics", analyticsRouter);

// HEALTH CHECK
app.get("/api/health", async (req, res) => {
  try {
    // Quick DB check
    const { error } = await require("./lib/supabase").supabaseAdmin.from("profiles").select("id").limit(1);
    const dbStatus = error ? "unhealthy" : "healthy";

    res.json({
      status: "ok",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      env: process.env.NODE_ENV || "development",
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// 404 HANDLER
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

// ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  console.error(err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error."
      : err.message,
  });
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 DigitalStudyCenter API running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Client URL:  ${process.env.CLIENT_URL || "https://digitalstudycenter.in"}\n`);
});
