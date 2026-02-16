// controllers/interviewController.js
const QuestionAnswer = require("../models/questionAnswerModel");
const Space = require("../models/spaceModel");
const { callGemini, callOpenAI, callCohere } = require("../config/aiServices");

// =====================================================
// Round-Specific Interview Guidelines by Experience Level
// =====================================================
const ROUND_GUIDELINES = {
  HR: {
    fresher:
      "Focus on: self-introduction, academic background, extracurricular activities, strengths/weaknesses, why this company, career goals, teamwork from college projects, willingness to relocate, expected salary range for freshers.",
    intermediate:
      "Focus on: career progression, reason for job change, key achievements, team collaboration, conflict resolution, leadership examples, salary expectations, notice period, professional growth goals.",
    experienced:
      "Focus on: leadership and management style, strategic vision, team building, mentoring approach, handling pressure/deadlines, organizational culture fit, long-term career goals, compensation expectations, measurable impact.",
  },
  Technical: {
    fresher:
      "Focus on: core CS fundamentals (data structures, algorithms, OOP), basic programming in languages on resume, simple coding problems, academic project discussions, basic database concepts, willingness to learn.",
    intermediate:
      "Focus on: practical coding experience, design patterns, debugging complex issues, code optimization, database design, REST API design, testing strategies, system integration, real-world problem solving from their work experience.",
    experienced:
      "Focus on: system architecture decisions, technology trade-offs, performance optimization at scale, code review best practices, technical debt management, cross-team technical collaboration, emerging tech evaluation, mentoring engineers.",
  },
  Final: {
    fresher:
      "Comprehensive final round: mix of HR + technical basics + cultural fit. Assess overall readiness, motivation, and growth potential. Be thorough but encouraging.",
    intermediate:
      "Comprehensive senior-level final: cover leadership potential, technical depth, strategic thinking, cultural alignment. Ask probing questions about real experiences.",
    experienced:
      "Executive-level final round: cover vision/strategy, leadership philosophy, organizational impact, technical judgment, stakeholder management.",
  },
};

const MAX_QUESTIONS = { fresher: 10, intermediate: 12, experienced: 15 };

function getRoundGuidelines(roundName, level) {
  const safeLevel = level || "fresher";
  const round = ROUND_GUIDELINES[roundName];
  if (!round) {
    return `Conduct a professional "${roundName}" interview appropriate for a ${safeLevel} candidate.`;
  }
  return round[safeLevel] || round["fresher"];
}

// =====================================================
// START ROUND — Generate first question (Gemini)
// =====================================================
exports.startRound = async (req, res) => {
  try {
    const { spaceId, roundName } = req.params;
    const space = await Space.findById(spaceId);
    if (!space) return res.status(404).json({ error: "Space not found" });

    const level = space.experienceLevel || "fresher";
    const total = MAX_QUESTIONS[level] || 12;
    const guidelines = getRoundGuidelines(roundName, level);

    const prompt = `You are an expert interviewer at "${space.companyName}" conducting a "${roundName}" interview round.

CANDIDATE PROFILE:
- Experience Level: ${level.toUpperCase()}
- Applying for: ${space.jobPosition}
- Resume Summary: ${space.purifiedSummary}
- Job Description: ${space.jobDescription}

ROUND GUIDELINES (${level}):
${guidelines}

Start the interview with an appropriate opening question for this "${roundName}" round.

STRICT RULES:
- Ask exactly ONE question
- The question MUST be specific to "${roundName}" — absolutely NO questions from other round types
- Calibrate difficulty for a ${level} candidate
- Make the question relevant to the candidate's resume and the job role
- Return ONLY the question text — no numbering, no "Q:", no prefix, no explanation, no quotes`;

    const question = await callGemini(prompt);

    res.json({
      question,
      questionNumber: 1,
      totalQuestions: total,
      done: false,
    });
  } catch (err) {
    console.error("Error starting round:", err);
    res.status(500).json({ error: "Error generating first question." });
  }
};

// =====================================================
// NEXT QUESTION — Adaptive follow-up based on history
// =====================================================
exports.nextQuestion = async (req, res) => {
  try {
    const { spaceId, roundName } = req.params;
    const { conversationHistory, currentQuestionNumber } = req.body;
    const space = await Space.findById(spaceId);
    if (!space) return res.status(404).json({ error: "Space not found" });

    const level = space.experienceLevel || "fresher";
    const total = MAX_QUESTIONS[level] || 12;

    if (currentQuestionNumber > total) {
      return res.json({ done: true });
    }

    const guidelines = getRoundGuidelines(roundName, level);

    // Build conversation history text
    const historyText = conversationHistory
      .map(
        (item, i) =>
          `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer || "(No answer provided)"}`
      )
      .join("\n\n");

    // Determine interview phase
    let phase = "";
    if (currentQuestionNumber <= 3) {
      phase =
        "PHASE: Warm-up. Ask foundational, rapport-building questions for this round.";
    } else if (currentQuestionNumber <= total - 2) {
      phase = `PHASE: Core. Ask challenging, in-depth questions. Analyze previous answers:
- Weak/vague answer → probe deeper on that topic, ask for specifics or examples
- Strong answer → progress to harder topics or explore new areas
- Mentioned a specific technology/project → ask detailed follow-up about it
- Make the conversation flow naturally like a real interviewer would`;
    } else {
      phase =
        "PHASE: Closing. Ask reflective or wrap-up questions appropriate for this round type.";
    }

    const prompt = `You are an expert interviewer at "${space.companyName}" conducting a "${roundName}" interview round.

CANDIDATE PROFILE:
- Experience Level: ${level.toUpperCase()}
- Applying for: ${space.jobPosition}
- Resume Summary: ${space.purifiedSummary}

ROUND GUIDELINES (${level}):
${guidelines}

CONVERSATION SO FAR:
${historyText}

${phase}

This is question ${currentQuestionNumber} of ${total}.

STRICT RULES:
- Ask exactly ONE question
- MUST stay within "${roundName}" round scope — do NOT cross into other round types
- Carefully analyze ALL previous answers before generating the next question. If the candidate's previous answer was VAGUE or INCORRECT, ask a follow-up to clarify or correct them.
- Do NOT repeat topics already covered in the conversation
- The question should feel like a natural continuation of the conversation
- Calibrate for ${level} level. For experienced candidates, ask about trade-offs, architecture, and "why" not just "how".
- Return ONLY the question text — no numbering, no prefix, no explanation, no quotes`;

    const question = await callGemini(prompt);

    res.json({
      question,
      questionNumber: currentQuestionNumber,
      totalQuestions: total,
      done: false,
    });
  } catch (err) {
    console.error("Error generating next question:", err);
    res.status(500).json({ error: "Error generating next question." });
  }
};

// =====================================================
// FINISH ROUND — 3-AI Evaluation Pipeline
// =====================================================
exports.finishRound = async (req, res) => {
  try {
    const { spaceId, roundName } = req.params;
    const { answers } = req.body;
    const space = await Space.findById(spaceId);
    if (!space) return res.status(404).json({ error: "Space not found" });

    const level = space.experienceLevel || "fresher";

    // Save Q&A to database
    const questionsAndAnswers = Object.entries(answers).map(
      ([question, answer]) => ({
        spaceId,
        roundName,
        question,
        answer,
      })
    );
    await QuestionAnswer.insertMany(questionsAndAnswers);

    // Build Q&A transcript
    const qaText = Object.entries(answers)
      .map(([q, a], i) => `Q${i + 1}: ${q}\nA${i + 1}: ${a}\n`)
      .join("\n");

    // ---- STEP 1 & 2: Gemini + OpenAI evaluate in parallel ----
    const evalPrompt = (aiName) => `You are ${aiName}, a world-class interview evaluator known for brutal honesty and high standards.

Evaluate this "${roundName}" interview for a ${level.toUpperCase()} candidate applying for "${space.jobPosition}" at "${space.companyName}".

INTERVIEW TRANSCRIPT:
${qaText}

Provide a detailed, EVIDENCE-BASED evaluation. You MUST quote specific answers to support your claims.

YOUR TASKS:
1. **Fact-Check**: Verify the technical accuracy of every answer. If the candidate is wrong, explicitly state it.
2. **Depth Analysis**: Did the candidate understand "why" or just "how"?
3. **Communication**: Was the candidate clear, concise, and structured?

SCORING CRITERIA (Total 10):
- Technical Accuracy (40%): ${level === 'experienced' ? 'Must show architectural depth' : 'Must know fundamentals'}
- Communication (30%): Clarity and structure
- Critical Thinking (30%): Problem-solving approach

OUTPUT FORMAT:
1. Overall Score (X/10) & Verdict (Strong Hire / Hire / No Hire)
2. key Strengths (with quotes)
3. Critical Weaknesses (with quotes - be specific!)
4. Suggested Improvements (Actionable advice)
5. Question-by-Question Rating (Strong/Adequate/Weak)

Be strict. A 7/10 is a high bar. Average candidates get 5-6.`;

    console.log("Starting Multi-AI Evaluation (Gemini + OpenAI)...");
    
    // Fallback if APIs are missing
    let geminiEval, openaiEval;
    
    try {
      geminiEval = await callGemini(evalPrompt("Evaluator A (Senior Technical Lead)"));
      console.log("Gemini evaluation complete.");
    } catch (e) {
      console.error("Gemini evaluation failed:", e);
    }

    try {
      openaiEval = await callOpenAI(evalPrompt("Evaluator B (Hiring Manager)"));
      if (openaiEval) console.log("OpenAI evaluation complete.");
    } catch (e) {
      console.error("OpenAI evaluation failed:", e);
    }

    // ---- STEP 3: Cohere synthesizes the final summary ----
    let finalSummary;

    if (geminiEval && openaiEval) {
      console.log("Synthesizing with Cohere...");
      const synthesisPrompt = `You are a Chief Talent Officer.

Your goal is to synthesize two independent evaluations into ONE definitive, high-accuracy report.

CONTEXT:
- Round: ${roundName}
- Candidate Level: ${level.toUpperCase()}

EVALUATOR A (Technical Lead):
${geminiEval}

EVALUATOR B (Hiring Manager):
${openaiEval}

INSTRUCTIONS:
1. Compare the scores. If they differ, explain why and provide a balanced final score.
2. highlighting the *consensus* strengths and weaknesses.
3. If one evaluator flagged a technical error, include it!
4. The tone should be professional, encouraging, but strictly honest.

OUTPUT FORMAT (Markdown):
## 🏁 Final Verdict: [Score/10] — [PASS/FAIL]

## 📝 Executive Summary
(Synthesized view of candidate performance)

## 💪 Key Strengths
(Bullet points, referencing specific answers)

## ⚠️ Critical Areas for Improvement
(Bullet points, with SPECIFIC actionable advice)

## 🔍 Technical Accuracy Check
(Did the candidate make any factual errors? If so, list them.)

## 📊 Question Breakdown
(Quick rating for each question)

## 🚀 Recommendation
(Hire / No Hire / Strong Hire)

*Evaluation generated using Multi-AI Consensus (Gemini + OpenAI + Cohere)*`;

      const cohereResult = await callCohere(synthesisPrompt);
      
      if (cohereResult) {
        finalSummary = cohereResult;
        console.log("Cohere synthesis complete.");
      } else {
        finalSummary = `## Evaluator 1 Assessment\n\n${geminiEval}\n\n---\n\n## Evaluator 2 Assessment\n\n${openaiEval}\n\n*(Cohere synthesis unavailable)*`;
      }
    } else if (geminiEval) {
      finalSummary = geminiEval + "\n\n*(Single-AI Evaluation: High-Accuracy Mode)*";
    } else if (openaiEval) {
      finalSummary = openaiEval + "\n\n*(Single-AI Evaluation: High-Accuracy Mode)*";
    } else {
      finalSummary = "Error: Unable to generate evaluation. Please try again.";
    }

    // Save summary to the round
    const round = space.interviewRounds.find((r) => r.name === roundName);
    if (round) {
      round.summary = finalSummary;
      round.status = "completed";
      await space.save();
    }

    res.status(200).json({ success: true, message: "Round completed." });
  } catch (err) {
    console.error("Error finishing round:", err);
    res.status(500).json({ error: "Error finishing round." });
  }
};

// =====================================================
// GET QUESTIONS & ANSWERS
// =====================================================
exports.getQuestionsAnswers = async (req, res) => {
  try {
    const { roundId } = req.params;
    const space = await Space.findOne({ "interviewRounds._id": roundId });
    if (!space) return res.status(404).json({ error: "Round not found" });

    const questionsAnswers = await QuestionAnswer.find({
      spaceId: space._id,
      roundName: space.interviewRounds.find(
        (r) => r._id.toString() === roundId
      ).name,
    }).sort({ createdAt: 1 });

    res.json(questionsAnswers);
  } catch (err) {
    console.error("Error fetching questions and answers:", err);
    res.status(500).json({ error: "Error fetching questions and answers" });
  }
};

// =====================================================
// GENERATE FOLLOW-UP QUESTION
// =====================================================
exports.generateFollowUpQuestions = async (req, res) => {
  try {
    const { questionId } = req.params;
    const questionAnswer = await QuestionAnswer.findById(questionId);
    if (!questionAnswer)
      return res.status(404).send("Question not found");

    const prompt = `Original Question: "${questionAnswer.question}"
Student's Answer: "${questionAnswer.answer}"

Generate one smart follow-up question that probes deeper into their answer.
Return ONLY the question text.`;

    const followUpQuestion = await callGemini(prompt);

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
