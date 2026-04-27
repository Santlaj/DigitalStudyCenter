require("dotenv").config();

const express = require("express");
const cors = require("cors");    // it control which frontend can access the backend
const helmet = require("helmet"); // it add security headers to the backend
const morgan = require("morgan"); // it log the requests in terminal
const { globalLimiter } = require("./middleware/rateLimiter");

const app = express();
const PORT = process.env.PORT || 3000;

// GLOBAL MIDDLEWARE - Security headers
app.use(helmet());

// CORS — allow client origins
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://digitalstudycenter.in",
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`CORS blocked origin: ${origin}`);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// in development mode, it will log the requests in terminal
// in production mode, it will not log the requests in terminal
// in combined -> 203.0.113.10 - - [27/Apr/2026:18:30:14 +0530] "GET /api/users HTTP/1.1" 200 532 "https://example.com" "Mozilla/5.0 ..."
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Global rate limiter
app.use(globalLimiter);


// JSON body parser (limit 2MB for form data)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ROUTES
// Root route for health check
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
const announcementsRouter = require("./routes/announcements");
const analyticsRouter = require("./routes/analytics");


//If request starts with this URL, send it to this router file.
app.use("/api/auth", authRouter);  // request starting with /api/auth goes to routes/auth.js
app.use("/api/dashboard", dashboardRouter);
app.use("/api/users", usersRouter);
app.use("/api/notes", notesRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/fees", feesRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/analytics", analyticsRouter);

// DATABASE HEALTH CHECK
app.get("/api/health", async (req, res) => {
  try {
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
