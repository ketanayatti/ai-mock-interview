// controllers/spaceController.js

const Space = require("../models/spaceModel");
const Session = require("../models/sessionModel");
const { GoogleGenAI } = require("@google/genai");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const marked = require("marked");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

// =======================
// Gemini Initialization
// =======================
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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
// Gemini Resume Summary
// =======================
const purifyContent = async (resumeText, jobDescription) => {
  let prompt;

  if (jobDescription && jobDescription.trim().length > 20) {
    prompt = `
Resume:
"${resumeText}"

Job Description:
"${jobDescription}"

Summarize only the most relevant skills, achievements, and qualifications 
that match the job description.
Be concise and clear.
`;
  } else {
    prompt = `
Resume:
"${resumeText}"

Summarize the key strengths, skills, and achievements.
Be concise and clear.
`;
  }

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return result.text;
  } catch (error) {
    console.error("Error summarizing content:", error);
    return "Error generating summary";
  }
};

// =======================
// Create Interview Space
// =======================
exports.createSpace = async (req, res) => {
  try {
    const { companyName, jobPosition, interviewRounds, jobDescription } =
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
