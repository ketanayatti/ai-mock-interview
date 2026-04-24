// routes.js
const express = require("express");
const router = express.Router();
const sessionController = require("./controllers/sessionController");
const spaceController = require("./controllers/spaceController");
const interviewController = require("./controllers/interviewController");
const Space = require("./models/spaceModel"); // Import Space model
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Simple protection middleware
const protect = (req, res, next) => {
  if (!req.session.uniqueId) {
    return res.redirect("/");
  }
  next();
};

// Ensure 'Resumes' folder exists
const resumeFolderPath = path.join(__dirname, "../public/Resumes");
if (!fs.existsSync(resumeFolderPath)) {
  fs.mkdirSync(resumeFolderPath, { recursive: true });
}

// Sanitize filename to prevent path traversal
const sanitizeFilename = (filename) => {
  // Remove path separators and null bytes
  return filename.replace(/[/\\:\0]/g, "_").replace(/\.\./g, "_");
};

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, resumeFolderPath);
  },
  filename: (req, file, cb) => {
    const safeName = sanitizeFilename(file.originalname);
    const uniqueName = Date.now() + "-" + safeName;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files are allowed."), false);
    }
  },
});

// Welcome page
router.get("/", (req, res) => {
  if (req.session.uniqueId) {
    return res.redirect("/dashboard");
  }
  res.render("home");
});

router.get("/welcome", (req, res) => {
  res.render("welcome");
});

// API: Get questions and answers for a round
router.get(
  "/api/questions-answers/:roundId",
  protect,
  interviewController.getQuestionsAnswers,
);

// Download resume
router.get(
  "/space/resume/download/:id",
  protect,
  spaceController.downloadResume,
);

// API: AJAX session creation
router.post("/api/start-new", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Name is required" });
    }

    // Call the session controller function
    const session = await sessionController.createSession(name);

    // Store in session cookie
    req.session.uniqueId = session.uniqueId;
    req.session.name = session.name;

    // Return success with the session data
    return res.json({
      success: true,
      uniqueId: session.uniqueId,
      redirectUrl: "/dashboard",
    });
  } catch (error) {
    console.error("Error creating session:", error);
    return res.status(500).json({ error: "Error creating session" });
  }
});

// API: AJAX session continuation
router.post("/api/continue-session", async (req, res) => {
  try {
    const { uniqueId } = req.body;

    if (!uniqueId || uniqueId.trim() === "") {
      return res.status(400).json({ error: "Session ID is required" });
    }

    // Attempt to find the session
    const session = await sessionController.findSession(uniqueId);

    if (!session) {
      return res
        .status(404)
        .json({ error: "Session not found. Please check your ID." });
    }

    // Store in session cookie
    req.session.uniqueId = session.uniqueId;
    req.session.name = session.name;

    // Return success
    return res.json({
      success: true,
      redirectUrl: "/dashboard",
    });
  } catch (error) {
    console.error("Error continuing session:", error);
    return res.status(500).json({ error: "Error accessing session" });
  }
});

// Session routes
router.post("/start-new", sessionController.startNew);
router.post("/continue-session", sessionController.continueSession);
router.get("/end-session", sessionController.endSession);

// Dashboard routes (protected)
router.get("/dashboard", protect, spaceController.getSpaces);
router.get("/profile", protect, sessionController.getProfile);
router.post("/update-profile", protect, sessionController.updateProfile);
router.get("/performance", protect, spaceController.getPerformance);

// Space routes
router.post(
  "/spaces/create",
  [protect, upload.single("resume")],
  spaceController.createSpace,
);
router.get("/space/:id", protect, spaceController.getSpaceDetails);

// Interview routes
// Interview routes
router.get(
  "/space/:spaceId/round/:roundName/start",
  protect,
  async (req, res) => {
    try {
      const { spaceId, roundName } = req.params;
      const space = await Space.findById(spaceId);

      if (!space) {
        return res.status(404).json({ error: "Space not found" });
      }

      res.render("student/interview-screen", { spaceId, roundName, space });
    } catch (error) {
      console.error("Error loading interview screen:", error);
      res.status(500).send("Server Error");
    }
  },
);

router.get(
  "/generate-questions/:spaceId/:roundName",
  protect,
  interviewController.startRound,
);
router.post(
  "/next-question/:spaceId/:roundName",
  protect,
  interviewController.nextQuestion,
);
router.post(
  "/finish-round/:spaceId/:roundName",
  protect,
  interviewController.finishRound,
);

// API: Per-Space AI Performance Insights — 3-Stage Pipeline with Caching
// Each space and round is treated as an INDIVIDUAL unit — never mixed together.
// Cached results (round.aiInsights) are returned instantly with ZERO AI calls.
router.get("/api/performance-insights", protect, async (req, res) => {
  try {
    const { generateRoundInsights, getHealthStatus } = require("./config/aiServices");
    const QuestionAnswer = require("./models/questionAnswerModel");

    const spaces = await Space.find({ studentId: req.session.uniqueId }).sort({ createdAt: -1 });

    if (!spaces.length) {
      return res.json({
        success: true,
        perSpaceInsights: [],
        globalStats: null,
        message: "No interview spaces found. Create a space and complete at least one round.",
      });
    }

    const perSpaceInsights = [];
    let newAnalysisCount = 0;
    let cachedCount = 0;

    for (const space of spaces) {
      const spaceResult = {
        spaceId:         space._id,
        companyName:     space.companyName,
        jobPosition:     space.jobPosition,
        experienceLevel: space.experienceLevel,
        createdAt:       space.createdAt,
        rounds:          [],
      };

      for (const round of (space.interviewRounds || [])) {
        // ── Non-completed rounds: add as-is, no AI needed ──
        if (round.status !== "completed") {
          spaceResult.rounds.push({
            roundName:  round.name,
            status:     round.status,
            aiInsights: null,
            cached:     false,
          });
          continue;
        }

        // ── Completed round with cached insights → return instantly ──
        if (round.aiInsights && round.aiInsights.generatedAt) {
          console.log(`[PERF API] ⚡ Cache hit: ${space.companyName} → ${round.name}`);
          cachedCount++;
          spaceResult.rounds.push({
            roundName:  round.name,
            status:     round.status,
            aiInsights: round.aiInsights,
            cached:     true,
          });
          continue;
        }

        // ── Completed round, no cache → run 3-stage pipeline ──
        console.log(`[PERF API] 🔄 Running pipeline: ${space.companyName} → ${round.name}`);
        newAnalysisCount++;

        // Fetch actual Q&A records for this specific round
        const qas = await QuestionAnswer.find({
          spaceId:   space._id,
          roundName: round.name,
        }).sort({ createdAt: 1 });

        if (!qas.length && !round.summary) {
          // No transcript and no summary — skip this round
          console.warn(`[PERF API] No data for ${space.companyName} → ${round.name}. Skipping.`);
          spaceResult.rounds.push({
            roundName: round.name,
            status:    round.status,
            aiInsights: null,
            cached:    false,
            error:     "No Q&A data found for this round.",
          });
          continue;
        }

        try {
          const insights = await generateRoundInsights(
            round.name,
            space.experienceLevel || "fresher",
            qas.map(q => ({ question: q.question, answer: q.answer || "" })),
            round.summary || ""
          );

          // Persist to DB — never run again for this round
          round.aiInsights = insights;
          await space.save();

          spaceResult.rounds.push({
            roundName:  round.name,
            status:     round.status,
            aiInsights: insights,
            cached:     false,
          });
        } catch (err) {
          console.error(`[PERF API] Pipeline error for ${space.companyName} → ${round.name}:`, err.message);
          spaceResult.rounds.push({
            roundName:  round.name,
            status:     round.status,
            aiInsights: null,
            cached:     false,
            error:      "Analysis failed — please try again.",
          });
        }
      }

      // Per-space aggregate (from this space's rounds only — no mixing)
      const scoredRounds = spaceResult.rounds.filter(r => r.aiInsights?.overallScore != null);
      spaceResult.avgScore = scoredRounds.length > 0
        ? Math.round(scoredRounds.reduce((s, r) => s + r.aiInsights.overallScore, 0) / scoredRounds.length)
        : null;
      // Final verdict = verdict of the last completed round
      const lastScored = scoredRounds[scoredRounds.length - 1];
      spaceResult.overallVerdict = lastScored?.aiInsights?.overallVerdict || null;

      perSpaceInsights.push(spaceResult);
    }

    // Global stats (for the header stat cards — still individual, but aggregated for display)
    const allScoredRounds = perSpaceInsights.flatMap(s =>
      s.rounds.filter(r => r.aiInsights?.overallScore != null)
    );
    const globalAvgScore = allScoredRounds.length > 0
      ? Math.round(allScoredRounds.reduce((s, r) => s + r.aiInsights.overallScore, 0) / allScoredRounds.length)
      : null;

    console.log(`[PERF API] Done — cached: ${cachedCount}, new: ${newAnalysisCount}, total rounds: ${allScoredRounds.length}`);

    res.json({
      success: true,
      perSpaceInsights,
      globalStats: {
        avgScore:            globalAvgScore,
        totalCompletedRounds:allScoredRounds.length,
        totalSpaces:         spaces.length,
        cachedRounds:        cachedCount,
        newAnalysisRun:      newAnalysisCount,
        healthStatus:        getHealthStatus(),
      },
    });
  } catch (err) {
    console.error("[PERF API] Fatal error:", err);
    res.status(500).json({ success: false, error: "Error generating insights. Please try again." });
  }
});

module.exports = router;
