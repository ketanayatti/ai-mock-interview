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
  return filename
    .replace(/[/\\:\0]/g, "_")
    .replace(/\.\./g, "_");
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

// Health check endpoint (for CI/CD deployment verification)
router.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
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
router.get("/space/:spaceId/round/:roundName/start", protect, async (req, res) => {
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
});

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

// API: Generate AI Performance Insights via 3-AI Pipeline
router.get("/api/performance-insights", protect, async (req, res) => {
  try {
    const { callGemini, callOpenAI, callCohere } = require("./config/aiServices");
    const QuestionAnswer = require("./models/questionAnswerModel");
    
    const spaces = await Space.find({ studentId: req.session.uniqueId });
    
    // Collect all completed round summaries and Q&A data
    const completedRounds = [];
    spaces.forEach(space => {
      if (space.interviewRounds) {
        space.interviewRounds.forEach(round => {
          if (round.status === 'completed' && round.summary) {
            completedRounds.push({
              company: space.companyName,
              position: space.jobPosition,
              level: space.experienceLevel,
              round: round.name,
              summary: round.summary.substring(0, 1500), // Truncate to avoid token limits
            });
          }
        });
      }
    });
    
    if (completedRounds.length === 0) {
      return res.json({
        success: true,
        insights: null,
        message: "No completed interviews to analyze yet. Complete at least one interview round to receive AI-powered performance insights."
      });
    }
    
    // Build the comprehensive analytics prompt
    const summariesText = completedRounds.map((r, i) => 
      `--- Interview ${i + 1}: ${r.company} | ${r.position} | ${r.round} Round (${r.level}) ---\n${r.summary}`
    ).join("\n\n");
    
    const analyticsPrompt = (aiRole) => `You are ${aiRole}, a career coaching AI that provides data-driven performance analytics.

TASK: Analyze the following ${completedRounds.length} completed interview evaluation(s) and produce a comprehensive performance report.

${summariesText}

Provide your analysis in the following STRICT JSON format (no markdown, no code blocks, ONLY valid JSON):
{
  "overallScore": <number 0-100>,
  "technicalScore": <number 0-100 or null if no technical rounds>,
  "communicationScore": <number 0-100>,
  "problemSolvingScore": <number 0-100>,
  "cultureFitScore": <number 0-100 or null if not applicable>,
  "confidenceScore": <number 0-100>,
  "topStrengths": ["strength1", "strength2", "strength3"],
  "criticalWeaknesses": ["weakness1", "weakness2", "weakness3"],
  "improvementPlan": ["action1", "action2", "action3"],
  "overallVerdict": "Strong Hire" | "Hire" | "Borderline" | "No Hire",
  "narrativeSummary": "A 2-3 sentence executive summary of the candidate's overall performance across all interviews."
}

IMPORTANT: Return ONLY the JSON object. No markdown formatting, no code blocks, no explanations outside the JSON.`;

    console.log("Generating AI Performance Insights...");
    
    let geminiResult, openaiResult;
    
    // Step 1: Gemini analysis
    try {
      const raw = await callGemini(analyticsPrompt("Performance Analyst A (Senior Career Coach)"), "evaluation");
      geminiResult = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      console.log("Gemini performance analysis complete.");
    } catch (e) {
      console.error("Gemini performance analysis error:", e.message);
    }
    
    // Step 2: OpenAI analysis (parallel if available)
    try {
      const raw = await callOpenAI(analyticsPrompt("Performance Analyst B (Talent Development Expert)"));
      if (raw) {
        openaiResult = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        console.log("OpenAI performance analysis complete.");
      }
    } catch (e) {
      console.error("OpenAI performance analysis error:", e.message);
    }
    
    // Step 3: Synthesize via Cohere or average manually
    let finalInsights;
    
    if (geminiResult && openaiResult) {
      // Try Cohere synthesis
      try {
        const synthesisPrompt = `You are a Chief Career Advisor. Two independent AI analysts have evaluated a candidate's performance across ${completedRounds.length} interview(s).

ANALYST A SCORES:
${JSON.stringify(geminiResult, null, 2)}

ANALYST B SCORES:
${JSON.stringify(openaiResult, null, 2)}

Synthesize both analyses into ONE definitive, balanced report. Average the numerical scores, merge the strengths/weaknesses, and provide a consensus verdict.

Return ONLY valid JSON in this format:
{
  "overallScore": <averaged number 0-100>,
  "technicalScore": <averaged number 0-100 or null>,
  "communicationScore": <averaged number 0-100>,
  "problemSolvingScore": <averaged number 0-100>,
  "cultureFitScore": <averaged number 0-100 or null>,
  "confidenceScore": <averaged number 0-100>,
  "topStrengths": ["merged strength1", "merged strength2", "merged strength3"],
  "criticalWeaknesses": ["merged weakness1", "merged weakness2", "merged weakness3"],
  "improvementPlan": ["merged action1", "merged action2", "merged action3"],
  "overallVerdict": "consensus verdict",
  "narrativeSummary": "synthesized 2-3 sentence executive summary",
  "evaluationMethod": "Multi-AI Consensus (Gemini + OpenAI + Cohere)"
}

Return ONLY the JSON object. No markdown, no code blocks.`;

        const cohereRaw = await callCohere(synthesisPrompt);
        if (cohereRaw) {
          finalInsights = JSON.parse(cohereRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
          finalInsights.evaluationMethod = "Multi-AI Consensus (Gemini + OpenAI + Cohere)";
          console.log("Cohere synthesis complete.");
        }
      } catch (e) {
        console.error("Cohere synthesis error:", e.message);
      }
      
      // Fallback: manual average
      if (!finalInsights) {
        const avg = (a, b) => (a !== null && b !== null) ? Math.round((a + b) / 2) : (a || b);
        finalInsights = {
          overallScore: avg(geminiResult.overallScore, openaiResult.overallScore),
          technicalScore: avg(geminiResult.technicalScore, openaiResult.technicalScore),
          communicationScore: avg(geminiResult.communicationScore, openaiResult.communicationScore),
          problemSolvingScore: avg(geminiResult.problemSolvingScore, openaiResult.problemSolvingScore),
          cultureFitScore: avg(geminiResult.cultureFitScore, openaiResult.cultureFitScore),
          confidenceScore: avg(geminiResult.confidenceScore, openaiResult.confidenceScore),
          topStrengths: [...new Set([...(geminiResult.topStrengths || []), ...(openaiResult.topStrengths || [])])].slice(0, 4),
          criticalWeaknesses: [...new Set([...(geminiResult.criticalWeaknesses || []), ...(openaiResult.criticalWeaknesses || [])])].slice(0, 4),
          improvementPlan: [...new Set([...(geminiResult.improvementPlan || []), ...(openaiResult.improvementPlan || [])])].slice(0, 4),
          overallVerdict: geminiResult.overallVerdict || openaiResult.overallVerdict,
          narrativeSummary: geminiResult.narrativeSummary || openaiResult.narrativeSummary,
          evaluationMethod: "Dual-AI Analysis (Gemini + OpenAI)",
        };
      }
    } else if (geminiResult) {
      finalInsights = { ...geminiResult, evaluationMethod: "Single-AI Analysis (Gemini)" };
    } else if (openaiResult) {
      finalInsights = { ...openaiResult, evaluationMethod: "Single-AI Analysis (OpenAI)" };
    } else {
      return res.json({ success: false, message: "AI analysis failed. Please try again." });
    }
    
    res.json({ success: true, insights: finalInsights });
  } catch (err) {
    console.error("Error generating performance insights:", err);
    res.status(500).json({ success: false, error: "Error generating insights." });
  }
});

module.exports = router;
