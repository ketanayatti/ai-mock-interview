// app.js
const express = require("express");
const path = require("path");
const cookieSession = require("cookie-session");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
require("dotenv").config();

// Import routes
const routes = require("./routes");

const app = express();

// App readiness state for Blue-Green deployment
let appReady = false;

app.setReady = (ready) => {
  appReady = ready;
  if (ready) {
    console.log("[HEALTH] App marked as ready");
  } else {
    console.log("[HEALTH] App marked as not ready");
  }
};

app.getReady = () => appReady;

// Enable CORS (applied BEFORE routes)
app.use(cors());

// Configure rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests, please try again later" },
  skip: (req) => req.session && req.session.admin === true, // Skip for admins
});

const createSpaceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 space creations per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "You have created too many spaces. Please try again later.",
  },
  keyGenerator: (req) => req.session.uniqueId || req.ip, // Use session ID if available
});

const interviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 interview actions per hour (adaptive questioning uses ~15 per round)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Interview limit reached. Please try again later." },
  keyGenerator: (req) => req.session.uniqueId || req.ip,
});

// Session middleware (cookie-session compatible options)
app.use(
  cookieSession({
    name: "session",
    secret: process.env.SESSION_SECRET || "interviewAppSecret",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  }),
);

// Middleware to parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set views directory and view engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Handle favicon.ico to prevent 404 errors
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Apply rate limiting to specific routes
app.use("/api/", apiLimiter);
app.use("/spaces/create", createSpaceLimiter);
app.use(
  ["/generate-questions", "/next-question", "/finish-round"],
  interviewLimiter,
);

// Health check endpoint (readiness probe for deployment)
app.get("/health", (req, res) => {
  if (appReady) {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } else {
    res.status(503).json({
      status: "starting",
      timestamp: new Date().toISOString(),
    });
  }
});

// Routes
app.use("/", routes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render("404", { title: "404 - Page Not Found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.stack);

  // Handle rate limit errors
  if (err.statusCode === 429) {
    return res.status(429).render("error", {
      title: "Too Many Requests",
      message: "You have exceeded the request limit. Please try again later.",
    });
  }

  // Handle validation errors
  if (err.name === "ValidationError") {
    return res.status(400).render("error", {
      title: "Invalid Input",
      message: err.message,
    });
  }

  // Handle file upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).render("error", {
      title: "File Too Large",
      message: "File size exceeds the maximum limit (10MB).",
    });
  }

  // Default error response
  res.status(500).render("error", {
    title: "Server Error",
    message: "Something went wrong on our end. Please try again later.",
  });
});

module.exports = app;
