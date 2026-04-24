// controllers/spaceController.js

const Space = require("../models/spaceModel");
const Session = require("../models/sessionModel");
const { callGemini, generateSummary } = require("../config/aiServices");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const marked = require("marked");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

// =======================
// Extract PDF Text
// =======================
const extractTextFromPDF = async (filePath) => {
  const pdfBuffer = await fs.promises.readFile(filePath);
  const data = await pdfParse(pdfBuffer);
  return data.text;
};

// =======================
// Extract DOCX Text
// =======================
const extractTextFromDOCX = async (filePath) => {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
};

// =======================
// Resume Summary — Master Logic
// Delegates to generateSummary() in aiServices:
//   Primary:  Gemini 2.5-flash (token-capped, low-temp)
//   Fallback: Cohere 2
//   Last:     Static placeholder (never crashes)
// =======================
const purifyContent = async (resumeText, jobDescription) => {
  return await generateSummary(resumeText, jobDescription);
};

// =======================
// Create Interview Space
// =======================
exports.createSpace = async (req, res) => {
  try {
    const { companyName, jobPosition, interviewRounds, jobDescription, experienceLevel } =
      req.body;

    const rounds = Array.isArray(interviewRounds)
      ? interviewRounds
      : interviewRounds
        ? [interviewRounds]
        : [];

    const resumePath = req.file ? req.file.path : "";
    const fileName = req.file ? req.file.filename : "";

    if (!companyName || !jobPosition || rounds.length === 0 || !resumePath) {
      return res
        .status(400)
        .send(
          "Company name, job position, interview rounds, and resume are required.",
        );
    }

    let resumeText = "";

    if (resumePath.endsWith(".pdf")) {
      resumeText = await extractTextFromPDF(resumePath);
    } else if (resumePath.endsWith(".docx")) {
      resumeText = await extractTextFromDOCX(resumePath);
    } else {
      return res.status(400).send("Only PDF and DOCX are supported.");
    }

    const isJobDescriptionValid =
      jobDescription && jobDescription.trim().length > 20;

    const purifiedSummary = await purifyContent(
      resumeText,
      isJobDescriptionValid ? jobDescription : "",
    );

    const newSpace = new Space({
      studentId: req.session.uniqueId,
      companyName,
      jobPosition,
      experienceLevel: experienceLevel || 'fresher',
      interviewRounds: rounds.map((round) => ({ name: round })),
      jobDescription: isJobDescriptionValid ? jobDescription : "N/A",
      resumePath: fileName,
      resumeText,
      purifiedSummary,
    });

    await newSpace.save();

    await Session.findOneAndUpdate(
      { uniqueId: req.session.uniqueId },
      { $push: { spaces: newSpace._id } },
    );

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Error creating space:", err);
    res.status(500).send("Error creating space.");
  }
};

// =======================
// Get All Spaces
// =======================
exports.getSpaces = async (req, res) => {
  try {
    const spaces = await Space.find({ studentId: req.session.uniqueId });
    const session = await Session.findOne({
      uniqueId: req.session.uniqueId,
    });

    res.render("student/dashboard", {
      spaces,
      session,
      name: session ? session.name : "User",
      uniqueId: req.session.uniqueId,
    });
  } catch (err) {
    console.error("Error fetching spaces:", err);
    res.status(500).send("Error fetching spaces.");
  }
};

// =======================
// Get Space Details
// =======================
exports.getSpaceDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const space = await Space.findById(id);

    if (!space) {
      return res.status(404).send("Space not found.");
    }

    const window = new JSDOM("").window;
    const DOMPurify = createDOMPurify(window);

    if (space.jobDescription) {
      space.jobDescription = DOMPurify.sanitize(
        marked.parse(space.jobDescription),
      );
    }

    if (space.purifiedSummary) {
      space.purifiedSummary = DOMPurify.sanitize(
        marked.parse(space.purifiedSummary),
      );
    }

    if (space.interviewRounds && space.interviewRounds.length > 0) {
      space.interviewRounds = space.interviewRounds.map((round) => {
        if (round.summary && round.status !== "not completed") {
          round.summaryHTML = DOMPurify.sanitize(marked.parse(round.summary));
        }
        return round;
      });
    }

    res.render("student/space-details", {
      space,
      name: req.session.name || "User",
    });
  } catch (err) {
    console.error("Error fetching space details:", err);
    res.status(500).send("Error fetching space details.");
  }
};

// =======================
// Download Resume
// =======================
exports.downloadResume = (req, res) => {
  try {
    const resumeFileName = req.params.id;

    if (!resumeFileName) {
      return res.status(400).send("Resume file not specified");
    }

    const filePath = path.resolve(
      path.join(__dirname, "../../public/Resumes", resumeFileName),
    );

    if (
      !filePath.startsWith(
        path.resolve(path.join(__dirname, "../../public/Resumes")),
      )
    ) {
      return res.status(403).send("Access denied");
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Resume file not found");
    }

    res.download(filePath);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Error downloading file");
  }
};

// =======================
// Start Interview Round
// =======================
exports.startInterviewRound = async (req, res) => {
  try {
    const { id, roundName } = req.params;
    const space = await Space.findById(id);

    if (!space) {
      return res.status(404).send("Space not found");
    }

    const round = space.interviewRounds.find((r) => r.name === roundName);

    if (!round) {
      return res.status(404).send("Round not found");
    }

    round.status = "in_progress";
    await space.save();

    res.redirect(`/space/${id}/round/${roundName}/start`);
  } catch (err) {
    console.error("Error starting interview round:", err);
    res.status(500).send("Error starting interview round");
  }
};

// =======================
// Extract Score from AI Summary
// =======================
function extractScoreFromSummary(summary) {
  if (!summary) return null;
  
  // Try multiple patterns the AI models use in their evaluations
  const patterns = [
    /(?:overall\s*score|final\s*(?:verdict|score)|score)\s*[:\-—]\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /(\d+(?:\.\d+)?)\s*out\s*of\s*10/i,
    /score\s*[:\-—]\s*(\d+(?:\.\d+)?)%/i,
  ];
  
  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match) {
      let score = parseFloat(match[1]);
      // If score is out of 10, convert to percentage
      if (score <= 10) score = score * 10;
      return Math.min(100, Math.round(score));
    }
  }
  return null;
}

// =======================
// Extract Verdict from AI Summary
// =======================
function extractVerdictFromSummary(summary) {
  if (!summary) return null;
  
  const verdictPatterns = [
    /strong\s*hire/i,
    /hire/i,
    /no\s*hire/i,
    /pass/i,
    /fail/i,
  ];
  
  if (/strong\s*hire/i.test(summary)) return "Strong Hire";
  if (/no\s*hire/i.test(summary)) return "No Hire";
  if (/\bhire\b/i.test(summary)) return "Hire";
  if (/\bfail\b/i.test(summary)) return "Fail";
  if (/\bpass\b/i.test(summary)) return "Pass";
  return null;
}

// =======================
// Get Score from Round (prefers aiInsights, falls back to regex)
// =======================
function getScoreFromRound(round) {
  if (round.aiInsights && round.aiInsights.overallScore != null) {
    return round.aiInsights.overallScore;
  }
  return extractScoreFromSummary(round.summary);
}

// =======================
// Get Verdict from Round (prefers aiInsights, falls back to regex)
// =======================
function getVerdictFromRound(round) {
  if (round.aiInsights && round.aiInsights.overallVerdict) {
    return round.aiInsights.overallVerdict;
  }
  return extractVerdictFromSummary(round.summary);
}

// =======================
// Get Performance Data
// =======================
exports.getPerformance = async (req, res) => {
  try {
    const spaces = await Space.find({ studentId: req.session.uniqueId }).sort({ createdAt: -1 });
    const session = await Session.findOne({
      uniqueId: req.session.uniqueId,
    });

    // Build detailed analytics from real data
    const roundAnalytics = []; // per-completed-round analytics
    const roundTypeStats = {}; // aggregated by round type (HR, Technical, etc.)
    const spaceAnalytics = []; // per-space analytics
    let totalScore = 0;
    let scoredRounds = 0;

    spaces.forEach(space => {
      const spaceData = {
        id: space._id,
        companyName: space.companyName,
        jobPosition: space.jobPosition,
        experienceLevel: space.experienceLevel,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
        rounds: [],
        avgScore: null,
      };

      let spaceScoreSum = 0;
      let spaceScoreCount = 0;

      if (space.interviewRounds) {
        space.interviewRounds.forEach(round => {
          // Use aiInsights first (accurate) — fall back to regex on markdown
          const score = getScoreFromRound(round);
          const verdict = getVerdictFromRound(round);

          const roundData = {
            spaceId: space._id,
            companyName: space.companyName,
            jobPosition: space.jobPosition,
            roundName: round.name,
            status: round.status,
            score: score,
            verdict: verdict,
            date: space.updatedAt || space.createdAt,
          };

          spaceData.rounds.push(roundData);

          if (round.status === 'completed') {
            roundAnalytics.push(roundData);

            if (score !== null) {
              totalScore += score;
              scoredRounds++;
              spaceScoreSum += score;
              spaceScoreCount++;

              // Aggregate by round type
              if (!roundTypeStats[round.name]) {
                roundTypeStats[round.name] = { total: 0, count: 0, scores: [] };
              }
              roundTypeStats[round.name].total += score;
              roundTypeStats[round.name].count++;
              roundTypeStats[round.name].scores.push(score);
            }
          }
        });
      }

      spaceData.avgScore = spaceScoreCount > 0 ? Math.round(spaceScoreSum / spaceScoreCount) : null;
      spaceAnalytics.push(spaceData);
    });

    // Compute aggregated stats
    const avgScore = scoredRounds > 0 ? Math.round(totalScore / scoredRounds) : null;
    
    // Round type averages for pie/radar chart
    const roundTypeAverages = {};
    Object.keys(roundTypeStats).forEach(name => {
      roundTypeAverages[name] = Math.round(roundTypeStats[name].total / roundTypeStats[name].count);
    });

    // Score trend (chronological, for line chart)
    const scoreTrend = roundAnalytics
      .filter(r => r.score !== null)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(r => ({
        label: `${r.companyName} - ${r.roundName}`,
        score: r.score,
        date: r.date,
      }));

    // Fetch Q&A counts per space
    const QuestionAnswer = require("../models/questionAnswerModel");
    const qaCounts = await QuestionAnswer.aggregate([
      { $match: { spaceId: { $in: spaces.map(s => s._id) } } },
      { $group: { _id: "$spaceId", totalQuestions: { $sum: 1 }, answeredQuestions: { $sum: { $cond: [{ $ne: ["$answer", ""] }, 1, 0] } } } },
    ]);
    const qaMap = {};
    qaCounts.forEach(item => {
      qaMap[item._id.toString()] = item;
    });

    const totalQuestions = qaCounts.reduce((s, i) => s + i.totalQuestions, 0);
    const totalAnswered = qaCounts.reduce((s, i) => s + i.answeredQuestions, 0);

    res.render("student/performance", {
      spaces,
      session,
      name: session ? session.name : "User",
      uniqueId: req.session.uniqueId,
      // New analytics data
      avgScore,
      scoredRounds,
      roundAnalytics: JSON.stringify(roundAnalytics),
      roundTypeAverages: JSON.stringify(roundTypeAverages),
      scoreTrend: JSON.stringify(scoreTrend),
      spaceAnalytics: JSON.stringify(spaceAnalytics),
      totalQuestions,
      totalAnswered,
      qaMap: JSON.stringify(qaMap),
    });
  } catch (err) {
    console.error("Error fetching performance data:", err);
    res.status(500).send("Error fetching performance data.");
  }
};
