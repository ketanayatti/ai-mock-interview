// controllers/interviewController.js

const QuestionAnswer = require("../models/questionAnswerModel");
const Space = require("../models/spaceModel");
const { GoogleGenAI } = require("@google/genai");

// Initialize once (global)
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// =====================
// Start Interview Round
// =====================
exports.startRound = async (req, res) => {
  try {
    const { spaceId, roundName } = req.params;
    const space = await Space.findById(spaceId);

    if (!space) {
      return res.status(404).send("Space not found");
    }

    const prompt = `
Based on the following details:
- Job Role: ${space.jobPosition}
- Company: ${space.companyName}
- Job Description: ${space.jobDescription}
- Resume Summary: ${space.purifiedSummary}
- Interview Round: ${roundName}

Generate 12-16 personalized interview questions:
1. Start with 2-3 warm-up questions.
2. Ask 8-10 role-specific and challenging questions.
3. End with 2-3 reflective questions.

Format:
1. Question
2. Question
...
`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = result.text;

    const questions = text.split("\n").filter((q) => /^\d+\.\s/.test(q.trim()));

    res.json({ questions });
  } catch (err) {
    console.error("Error generating questions:", err);
    res.status(500).send("Error generating interview questions.");
  }
};

// =====================
// Get Questions & Answers
// =====================
exports.getQuestionsAnswers = async (req, res) => {
  try {
    const { roundId } = req.params;

    const space = await Space.findOne({
      "interviewRounds._id": roundId,
    });

    if (!space) {
      return res.status(404).json({ error: "Round not found" });
    }

    const questionsAnswers = await QuestionAnswer.find({
      spaceId: space._id,
      roundName: space.interviewRounds.find((r) => r._id.toString() === roundId)
        .name,
    }).sort({ createdAt: 1 });

    res.json(questionsAnswers);
  } catch (err) {
    console.error("Error fetching questions and answers:", err);
    res.status(500).json({ error: "Error fetching questions and answers" });
  }
};

// =====================
// Finish Interview Round
// =====================
exports.finishRound = async (req, res) => {
  try {
    const { spaceId, roundName } = req.params;
    const { answers } = req.body;

    const questionsAndAnswers = Object.entries(answers).map(
      ([question, answer]) => ({
        spaceId,
        roundName,
        question,
        answer,
      }),
    );

    await QuestionAnswer.insertMany(questionsAndAnswers);

    const prompt = `
Summarize the interview round:

${Object.entries(answers)
  .map(([q, a]) => `Q: ${q}\nA: ${a}\n`)
  .join("")}

Provide:
- Performance evaluation
- Strengths
- Weaknesses
- Final improvement advice
`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const summary = result.text;

    const space = await Space.findById(spaceId);
    const round = space.interviewRounds.find((r) => r.name === roundName);

    round.summary = summary;
    round.status = "completed";

    await space.save();

    res.status(200).send("Round completed and summary generated.");
  } catch (err) {
    console.error("Error finishing round:", err);
    res.status(500).send("Error finishing round.");
  }
};

// =====================
// Generate Follow-up Question
// =====================
exports.generateFollowUpQuestions = async (req, res) => {
  try {
    const { questionId } = req.params;
    const questionAnswer = await QuestionAnswer.findById(questionId);

    if (!questionAnswer) {
      return res.status(404).send("Question not found");
    }

    const prompt = `
Original Question: "${questionAnswer.question}"
Student's Answer: "${questionAnswer.answer}"

Generate one smart follow-up question.
`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const followUpQuestion = result.text.trim();

    await QuestionAnswer.create({
      spaceId: questionAnswer.spaceId,
      roundName: questionAnswer.roundName,
      question: followUpQuestion,
      isFollowUp: true,
    });

    res.status(200).send("Follow-up question generated.");
  } catch (err) {
    console.error("Error generating follow-up question:", err);
    res.status(500).send("Error generating follow-up question.");
  }
};
