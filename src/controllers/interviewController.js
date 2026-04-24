// controllers/interviewController.js
const QuestionAnswer = require("../models/questionAnswerModel");
const Space = require("../models/spaceModel");
const { callGemini, callOpenAI, callCohere, generateInterviewQuestion, TOTAL_QUESTIONS } = require("../config/aiServices");

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

// All rounds use exactly TOTAL_QUESTIONS (10) — consistent, balanced, quota-friendly

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
    const guidelines = getRoundGuidelines(roundName, level);

    const prompt = `You are an expert interviewer at "${space.companyName}" conducting a "${roundName}" interview round.

CANDIDATE PROFILE:
- Experience Level: ${level.toUpperCase()}
- Applying for: ${space.jobPosition}
- Resume Summary: ${space.purifiedSummary}
- Job Description: ${space.jobDescription}

ROUND GUIDELINES (${level}):
${guidelines}

This is a WARM-UP opening question (Q1 of ${TOTAL_QUESTIONS}). Start with an easy, rapport-building introduction relevant to the round.

STRICT RULES:
- Ask exactly ONE question
- MUST stay within "${roundName}" scope — no crossing round types
- Calibrate for ${level} level
- Return ONLY the question text — no numbering, no prefix, no quotes`;

    const question = await generateInterviewQuestion(prompt, 1);

    res.json({
      question,
      questionNumber: 1,
      totalQuestions: TOTAL_QUESTIONS,
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

    if (currentQuestionNumber > TOTAL_QUESTIONS) {
      return res.json({ done: true });
    }

    const guidelines = getRoundGuidelines(roundName, level);

    // Build conversation history text
    const historyText = conversationHistory
      .map((item, i) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer || "(No answer provided)"}`)
      .join("\n\n");

    // Adaptive phase instruction based on question number (fixed 10-Q scale)
    let phase;
    if (currentQuestionNumber <= 4) {
      phase = "PHASE: WARM-UP (Q1–Q4) — Ask foundational questions. Build rapport. Keep it accessible.";
    } else if (currentQuestionNumber <= 8) {
      phase = `PHASE: CORE DEPTH (Q5–Q8) — Ask challenging, in-depth questions. Analyse previous answers:
- Vague/weak answer → probe deeper, ask for a specific example or evidence
- Strong answer → escalate difficulty, explore new areas
- Candidate mentioned a technology/project → ask detailed follow-up on it
- Make it flow naturally like a real senior interviewer`;
    } else {
      phase = `PHASE: CLOSING (Q9–Q10) — Ask the most important reflective and high-impact closing questions.
- Push for genuine insight: lessons learned, biggest challenges, real growth
- Make these questions memorable and revealing
- These MUST be the sharpest, most thoughtful questions of the entire interview`;
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

This is question ${currentQuestionNumber} of ${TOTAL_QUESTIONS}.

STRICT RULES:
- Ask exactly ONE question
- MUST stay within "${roundName}" round scope — never cross into other round types
- Read ALL previous answers. If any was vague or incorrect, probe it specifically.
- Do NOT repeat topics already fully covered
- Question must feel like a natural, intelligent continuation of the conversation
- Return ONLY the question text — no numbering, no prefix, no quotes`;

    const question = await generateInterviewQuestion(prompt, currentQuestionNumber);

    res.json({
      question,
      questionNumber: currentQuestionNumber,
      totalQuestions: TOTAL_QUESTIONS,
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
      geminiEval = await callGemini(evalPrompt("Evaluator A (Senior Technical Lead)"), "evaluation");
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

    // ---- STEP 3: Gemini synthesizes the final summary ----
    let finalSummary;

    if (geminiEval && openaiEval) {
      console.log("Synthesizing final summary with Gemini...");
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

*Evaluation generated using Multi-AI Consensus (Evaluators: Gemini + OpenAI, Synthesizer: Gemini)*`;

      const summaryResult = await callGemini(synthesisPrompt, "summary");
      
      if (summaryResult) {
        finalSummary = summaryResult;
        console.log("Gemini synthesis complete.");
      } else {
        finalSummary = `## Evaluator 1 Assessment\n\n${geminiEval}\n\n---\n\n## Evaluator 2 Assessment\n\n${openaiEval}\n\n*(Gemini synthesis unavailable)*`;
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
