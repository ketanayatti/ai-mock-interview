// config/aiServices.js — Centralized AI service initialization
const { GoogleGenAI } = require("@google/genai");

// Initialize Gemini (always required)
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize OpenAI (optional — graceful fallback)
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    const OpenAI = require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (e) {
  console.warn("OpenAI SDK not available:", e.message);
}

// Initialize Cohere 1 (Q1–Q4 primary)
let cohere = null;
try {
  if (process.env.COHERE_API_KEY) {
    const { CohereClientV2 } = require("cohere-ai");
    cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });
  }
} catch (e) {
  console.warn("Cohere 1 SDK not available:", e.message);
}

// Initialize Cohere 2 (Q5–Q8 primary + summary fallback + evaluations)
let cohere2 = null;
try {
  if (process.env.COHERE_API_KEY_2) {
    const { CohereClientV2 } = require("cohere-ai");
    cohere2 = new CohereClientV2({ token: process.env.COHERE_API_KEY_2 });
  }
} catch (e) {
  console.warn("Cohere 2 SDK not available:", e.message);
}

// ==============================================
// HEALTH MONITOR
// Tracks each provider's status in memory.
// Providers marked unhealthy are skipped for
// HEALTH_CACHE_TTL_MS before being retried.
// ==============================================
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const healthCache = {
  gemini:  { status: "unknown", lastChecked: null, failCount: 0, lastError: null },
  cohere1: { status: "unknown", lastChecked: null, failCount: 0, lastError: null },
  cohere2: { status: "unknown", lastChecked: null, failCount: 0, lastError: null },
  openai:  { status: "unknown", lastChecked: null, failCount: 0, lastError: null },
};

function isProviderHealthy(provider) {
  const h = healthCache[provider];
  if (!h.lastChecked) return true; // never tried = assume healthy
  if (h.status === "healthy") return true;
  // If unhealthy but TTL expired → allow retry
  return (Date.now() - h.lastChecked) > HEALTH_CACHE_TTL_MS;
}

function markHealthy(provider) {
  const h = healthCache[provider];
  h.status = "healthy";
  h.lastChecked = Date.now();
  h.failCount = 0;
  h.lastError = null;
  console.log(`[HEALTH ✅] ${provider.toUpperCase()} is healthy`);
}

function markUnhealthy(provider, reason) {
  const h = healthCache[provider];
  h.status = "unhealthy";
  h.lastChecked = Date.now();
  h.failCount += 1;
  h.lastError = reason;
  console.warn(`[HEALTH ❌] ${provider.toUpperCase()} unhealthy — ${reason} (fail #${h.failCount})`);
}

function getHealthStatus() {
  return {
    providers: { ...healthCache },
    timestamp: new Date().toISOString(),
  };
}

// ==============================================
// LOW-LEVEL CALLERS
// Each returns null on failure (never throws).
// ==============================================

async function _callCohereClient(client, providerKey, prompt, maxTokens = 500, temperature = 0.7) {
  if (!client || !isProviderHealthy(providerKey)) return null;
  try {
    const response = await client.chat({
      model: "command-a-03-2025",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    });
    const text = response?.message?.content?.[0]?.text?.trim();
    if (text && text.length > 5) {
      markHealthy(providerKey);
      return text;
    }
    markUnhealthy(providerKey, "Empty response");
    return null;
  } catch (err) {
    markUnhealthy(providerKey, err.message || "Unknown error");
    return null;
  }
}

async function _callGeminiDirect(prompt, maxTokens = 600, temperature = 0.7) {
  if (!isProviderHealthy("gemini")) return null;
  try {
    const result = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    });
    const text = result?.text?.trim();
    if (text && text.length > 5) {
      markHealthy("gemini");
      return text;
    }
    markUnhealthy("gemini", "Empty response");
    return null;
  } catch (err) {
    markUnhealthy("gemini", err.message || JSON.stringify(err) || "Unknown error");
    return null;
  }
}

async function _callOpenAIDirect(prompt) {
  if (!openai || !isProviderHealthy("openai")) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 600,
    });
    const text = response?.choices?.[0]?.message?.content?.trim();
    if (text && text.length > 5) {
      markHealthy("openai");
      return text;
    }
    markUnhealthy("openai", "Empty response");
    return null;
  } catch (err) {
    markUnhealthy("openai", err.message || "Unknown error");
    return null;
  }
}

// ==============================================
// TOKEN TRIMMER
// 1 token ≈ 4 chars (rough estimate)
// ==============================================
function trimToTokenBudget(text, maxTokens = 600) {
  if (!text) return "";
  const maxChars = maxTokens * 4;
  if (text.length > maxChars) {
    console.log(`[TOKEN TRIM] ${text.length}ch → ${maxChars}ch (~${maxTokens} tokens)`);
    return text.slice(0, maxChars) + "\n...[truncated]";
  }
  return text;
}

// ==============================================
// MASTER SUMMARY GENERATOR
// Primary:    Gemini 2.5-flash (token-capped)
// Fallback:   Cohere 2
// Last resort: Static placeholder (never crashes)
// ==============================================
async function generateSummary(resumeText, jobDescription) {
  const start = Date.now();
  console.log("\n[SUMMARY ENGINE] ─────────────────────────────");
  console.log("[SUMMARY ENGINE] Starting master summary generation...");

  const trimmedResume = trimToTokenBudget(resumeText, 800);
  const trimmedJD = trimToTokenBudget(jobDescription, 300);
  const hasValidJD = jobDescription && jobDescription.trim().length > 20;

  const prompt = hasValidJD
    ? `Summarize this resume in 6-8 bullet points. Focus ONLY on skills and experience matching the job description. Be concise, no filler words.

RESUME:
${trimmedResume}

JOB DESCRIPTION:
${trimmedJD}

Output: Bullet points only. No headings. No preamble.`
    : `Summarize this resume in 6-8 bullet points on top skills, experience, and achievements. Concise, no filler.

RESUME:
${trimmedResume}

Output: Bullet points only. No headings. No preamble.`;

  console.log(`[SUMMARY ENGINE] Prompt ~${Math.ceil(prompt.length / 4)} tokens`);

  // 1. Gemini primary
  console.log("[SUMMARY ENGINE] [1/2] Trying Gemini...");
  const geminiResult = await _callGeminiDirect(prompt, 400, 0.3);
  if (geminiResult) {
    console.log(`[SUMMARY ENGINE] ✅ Gemini SUCCESS (${Date.now() - start}ms)`);
    console.log("[SUMMARY ENGINE] ─────────────────────────────\n");
    return geminiResult;
  }

  // 2. Cohere 2 fallback
  if (cohere2) {
    console.log("[SUMMARY ENGINE] [2/2] Trying Cohere 2 fallback...");
    const c2Result = await _callCohereClient(cohere2, "cohere2", prompt, 400, 0.3);
    if (c2Result) {
      console.log(`[SUMMARY ENGINE] ✅ Cohere 2 FALLBACK SUCCESS (${Date.now() - start}ms)`);
      console.log("[SUMMARY ENGINE] ─────────────────────────────\n");
      return c2Result;
    }
  }

  // 3. Static placeholder
  console.error(`[SUMMARY ENGINE] ❌ ALL providers failed (${Date.now() - start}ms). Using placeholder.`);
  console.log("[SUMMARY ENGINE] ─────────────────────────────\n");
  return "• Summary could not be auto-generated. Resume uploaded successfully — interview can still proceed.";
}

// ==============================================
// MASTER INTERVIEW QUESTION GENERATOR
//
// ROTATION LOGIC (all rounds = 10 questions):
//   Q1–Q4   → Cohere 1 (primary) | Cohere 2 → Gemini → OpenAI (fallbacks)
//   Q5–Q8   → Cohere 2 (primary) | Cohere 1 → Gemini → OpenAI (fallbacks)
//   Q9–Q10  → DUAL MODE: Cohere 1 + Cohere 2 in parallel → Gemini picks best
//              Fallback: Gemini direct → OpenAI
//
// This distributes quota evenly and makes closing
// questions the sharpest by using both AIs.
// ==============================================
const TOTAL_QUESTIONS = 10;

async function generateInterviewQuestion(prompt, questionNumber) {
  const start = Date.now();
  const qLabel = `Q${questionNumber}/${TOTAL_QUESTIONS}`;

  console.log(`\n[INTERVIEW ENGINE] ─────────────────────────────`);
  console.log(`[INTERVIEW ENGINE] Generating ${qLabel}...`);

  // ── Q1–Q4: Cohere 1 primary ─────────────────
  if (questionNumber <= 4) {
    console.log(`[INTERVIEW ENGINE] ${qLabel} → Phase: WARM-UP | Primary: Cohere 1`);

    const c1 = await _callCohereClient(cohere, "cohere1", prompt);
    if (c1) {
      console.log(`[INTERVIEW ENGINE] ✅ Cohere 1 (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return c1;
    }

    console.log(`[INTERVIEW ENGINE] Cohere 1 failed → Fallback: Cohere 2`);
    const c2 = await _callCohereClient(cohere2, "cohere2", prompt);
    if (c2) {
      console.log(`[INTERVIEW ENGINE] ✅ Cohere 2 fallback (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return c2;
    }

    console.log(`[INTERVIEW ENGINE] Both Cohere failed → Fallback: Gemini`);
    const g = await _callGeminiDirect(prompt);
    if (g) {
      console.log(`[INTERVIEW ENGINE] ✅ Gemini fallback (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return g;
    }

    console.log(`[INTERVIEW ENGINE] Gemini failed → Last Resort: OpenAI`);
    const o = await _callOpenAIDirect(prompt);
    if (o) {
      console.log(`[INTERVIEW ENGINE] ✅ OpenAI last resort (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return o;
    }
  }

  // ── Q5–Q8: Cohere 2 primary ─────────────────
  else if (questionNumber <= 8) {
    console.log(`[INTERVIEW ENGINE] ${qLabel} → Phase: CORE | Primary: Cohere 2`);

    const c2 = await _callCohereClient(cohere2, "cohere2", prompt);
    if (c2) {
      console.log(`[INTERVIEW ENGINE] ✅ Cohere 2 (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return c2;
    }

    console.log(`[INTERVIEW ENGINE] Cohere 2 failed → Fallback: Cohere 1`);
    const c1 = await _callCohereClient(cohere, "cohere1", prompt);
    if (c1) {
      console.log(`[INTERVIEW ENGINE] ✅ Cohere 1 fallback (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return c1;
    }

    console.log(`[INTERVIEW ENGINE] Both Cohere failed → Fallback: Gemini`);
    const g = await _callGeminiDirect(prompt);
    if (g) {
      console.log(`[INTERVIEW ENGINE] ✅ Gemini fallback (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return g;
    }

    console.log(`[INTERVIEW ENGINE] Gemini failed → Last Resort: OpenAI`);
    const o = await _callOpenAIDirect(prompt);
    if (o) {
      console.log(`[INTERVIEW ENGINE] ✅ OpenAI last resort (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return o;
    }
  }

  // ── Q9–Q10: DUAL MODE ───────────────────────
  else {
    console.log(`[INTERVIEW ENGINE] ${qLabel} → Phase: CLOSING | Mode: DUAL (Cohere 1 + 2 parallel)`);

    // Fire both in parallel
    const [c1Result, c2Result] = await Promise.allSettled([
      _callCohereClient(cohere, "cohere1", prompt),
      _callCohereClient(cohere2, "cohere2", prompt),
    ]);

    const c1 = c1Result.status === "fulfilled" ? c1Result.value : null;
    const c2 = c2Result.status === "fulfilled" ? c2Result.value : null;

    console.log(`[INTERVIEW ENGINE] Dual results — Cohere1: ${c1 ? "✅" : "❌"} | Cohere2: ${c2 ? "✅" : "❌"}`);

    // Both responded → let Gemini pick the best one
    if (c1 && c2) {
      console.log(`[INTERVIEW ENGINE] Both available → Gemini selecting best question...`);
      const selectionPrompt = `You are an expert interview coach. Two AI interviewers have each suggested a closing interview question. Pick the ONE that is more specific, insightful, and natural for a closing round.

OPTION A: ${c1}

OPTION B: ${c2}

RULES:
- Return ONLY the better question text — no explanation, no label, no prefix.
- If both are equal quality, return OPTION A.`;

      const best = await _callGeminiDirect(selectionPrompt, 200, 0.2);
      if (best) {
        console.log(`[INTERVIEW ENGINE] ✅ Dual+Gemini selector (${Date.now() - start}ms)`);
        logInterviewEngineEnd();
        return best;
      }
      // Gemini selector failed but we still have both — use c1
      console.log(`[INTERVIEW ENGINE] Gemini selector failed. Using Cohere 1 result.`);
      logInterviewEngineEnd();
      return c1;
    }

    // Only one responded
    if (c1) {
      console.log(`[INTERVIEW ENGINE] ✅ Only Cohere 1 responded (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return c1;
    }
    if (c2) {
      console.log(`[INTERVIEW ENGINE] ✅ Only Cohere 2 responded (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return c2;
    }

    // All Cohere failed → Gemini direct
    console.log(`[INTERVIEW ENGINE] Both Cohere failed → Gemini direct`);
    const g = await _callGeminiDirect(prompt);
    if (g) {
      console.log(`[INTERVIEW ENGINE] ✅ Gemini fallback (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return g;
    }

    // Absolute last resort
    console.log(`[INTERVIEW ENGINE] Gemini failed → Last Resort: OpenAI`);
    const o = await _callOpenAIDirect(prompt);
    if (o) {
      console.log(`[INTERVIEW ENGINE] ✅ OpenAI last resort (${Date.now() - start}ms)`);
      logInterviewEngineEnd();
      return o;
    }
  }

  // All providers failed
  console.error(`[INTERVIEW ENGINE] ❌ ALL providers failed for ${qLabel} (${Date.now() - start}ms)`);
  logInterviewEngineEnd();
  throw new Error(`All AI providers failed generating question ${questionNumber}.`);
}

function logInterviewEngineEnd() {
  console.log("[INTERVIEW ENGINE] ─────────────────────────────\n");
}

// ==============================================
// GENERAL AI ROUTER (evaluations, follow-ups etc.)
// ==============================================
async function callGemini(prompt, taskType = "general") {
  // EVALUATION: Cohere 2 primary
  if (taskType === "evaluation" && cohere2) {
    const res = await _callCohereClient(cohere2, "cohere2", prompt, 800, 0.5);
    if (res) return res;
    console.log("[API] Cohere 2 eval failed → Cohere 1");
    if (cohere) {
      const r2 = await _callCohereClient(cohere, "cohere1", prompt, 800, 0.5);
      if (r2) return r2;
    }
  }
  // GENERAL: Cohere 1 primary
  else if (cohere) {
    const res = await _callCohereClient(cohere, "cohere1", prompt);
    if (res) return res;
    console.log("[API] Cohere 1 general failed → Cohere 2");
    if (cohere2) {
      const r2 = await _callCohereClient(cohere2, "cohere2", prompt);
      if (r2) return r2;
    }
  }

  // Gemini backup
  console.log("[API BACKUP] All Cohere failed → Gemini");
  const g = await _callGeminiDirect(prompt);
  if (g) return g;

  // OpenAI last resort
  if (openai) {
    console.log("[API BACKUP] Gemini failed → OpenAI");
    const o = await _callOpenAIDirect(prompt);
    if (o) return o;
  }

  console.error("CRITICAL: All AI providers exhausted.");
  throw new Error("All AI providers exhausted.");
}

async function callOpenAI(prompt) {
  return await _callOpenAIDirect(prompt);
}

async function callCohere(prompt) {
  if (cohere) return await _callCohereClient(cohere, "cohere1", prompt);
  return null;
}

// ==============================================
// HELPER: Derive Stage 1 from stored markdown summary
// Used when all AI calls for Stage 1 fail
// ==============================================
function _deriveStage1FromSummary(summary, totalQs) {
  const scoreMatch = summary.match(/(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const score10 = scoreMatch ? parseFloat(scoreMatch[1]) : 5;
  const commQuality = score10 >= 7 ? 'good' : score10 >= 5 ? 'average' : 'poor';

  return {
    qAnalysis: [],
    unansweredCount: 0,
    technicalErrors: 0,
    communicationQuality: commQuality,
    observations: 'Analysis derived from stored evaluation summary (transcript unavailable).',
  };
}

// ==============================================
// HELPER: Derive Stage 2 scores from Stage 1 analysis
// Used when both Cohere scoring calls fail
// ==============================================
function _deriveStage2FromStage1(stage1) {
  const qList = stage1.qAnalysis || [];
  if (qList.length === 0) {
    return { technicalScore: 50, communicationScore: 50, problemSolvingScore: 50, confidenceScore: 50, overallScore: 50 };
  }
  const avgAnswerScore = qList.reduce((s, q) => s + (q.score || 5), 0) / qList.length;
  const base = Math.round(avgAnswerScore * 10); // 0-100
  const commMap = { excellent: 85, good: 70, average: 55, poor: 35 };
  const comm = commMap[stage1.communicationQuality || 'average'];
  return {
    technicalScore: base,
    communicationScore: comm,
    problemSolvingScore: Math.max(0, base - 5),
    confidenceScore: Math.max(0, base - 5),
    overallScore: Math.round((base + comm + Math.max(0, base - 5)) / 3),
  };
}

// ==============================================
// HELPER: Apply realism penalties to raw scores
// Ensures scores reflect actual performance
// ==============================================
function _applyScorePenalties(stage2, unanswered, techErrors, commQuality) {
  let { technicalScore, communicationScore, problemSolvingScore, confidenceScore, overallScore } = stage2;

  // Each unanswered question = -4 pts from overall (capped at -30)
  const unansweredPenalty = Math.min(unanswered * 4, 30);
  overallScore = Math.max(0, overallScore - unansweredPenalty);

  // Each confirmed technical error = -5 from technicalScore
  technicalScore = Math.max(0, technicalScore - (techErrors * 5));

  // Poor communication caps communicationScore
  if (commQuality === 'poor') communicationScore = Math.min(communicationScore, 40);

  // Overall must not wildly exceed component average
  const componentAvg = Math.round((technicalScore + communicationScore + problemSolvingScore) / 3);
  overallScore = Math.min(overallScore, componentAvg + 8); // at most 8 pts above component avg

  return {
    technicalScore:     Math.max(0, Math.min(100, Math.round(technicalScore))),
    communicationScore: Math.max(0, Math.min(100, Math.round(communicationScore))),
    problemSolvingScore:Math.max(0, Math.min(100, Math.round(problemSolvingScore))),
    confidenceScore:    Math.max(0, Math.min(100, Math.round(confidenceScore))),
    overallScore:       Math.max(0, Math.min(100, Math.round(overallScore))),
  };
}

// ==============================================
// HELPER: Enforce score→verdict mapping strictly
// Prevents AI from giving "Hire" at 40% etc.
// ==============================================
function _enforceVerdictFromScore(score) {
  if (score >= 75) return 'Strong Hire';
  if (score >= 60) return 'Hire';
  if (score >= 45) return 'Borderline';
  return 'No Hire';
}

// ==============================================
// HELPER: Derive Stage 3 verdict from scores + Stage 1
// Used when all Stage 3 AI calls fail
// ==============================================
function _deriveStage3FromScores(stage2, stage1, roundName) {
  const verdict = _enforceVerdictFromScore(stage2.overallScore);
  const strengths = [];
  const weaknesses = [];
  const plan = [];

  if (stage2.communicationScore >= 65) strengths.push('Clear and structured communication shown throughout');
  if (stage2.technicalScore >= 65) strengths.push('Solid technical knowledge demonstrated');
  if (stage2.problemSolvingScore >= 65) strengths.push('Good analytical and problem-solving approach');
  if (strengths.length === 0) strengths.push('Some positive responses recorded in early questions');

  if (stage2.technicalScore < 55) weaknesses.push('Technical depth needs significant improvement');
  if (stage2.communicationScore < 55) weaknesses.push('Answers lacked structure and clarity');
  const ua = stage1.unansweredCount || 0;
  if (ua > 0) weaknesses.push(`${ua} question(s) were not answered — critical gap`);
  if (weaknesses.length === 0) weaknesses.push('Minor inconsistencies in answers noted');

  plan.push('Always answer every question, even with partial knowledge — silence hurts more');
  if (stage2.technicalScore < stage2.communicationScore) {
    plan.push(`Deepen ${roundName} technical knowledge — review core concepts weekly`);
  } else {
    plan.push('Practice structuring answers using the STAR method (Situation, Task, Action, Result)');
  }
  plan.push('Record mock interviews and review your own responses critically');

  return {
    overallVerdict: verdict,
    topStrengths: strengths.slice(0, 3),
    criticalWeaknesses: weaknesses.slice(0, 3),
    improvementPlan: plan.slice(0, 3),
    narrativeSummary: `Candidate achieved ${stage2.overallScore}/100 in the ${roundName} round. ${verdict === 'No Hire' || verdict === 'Borderline' ? 'Performance requires significant improvement before progressing.' : 'Performance is competitive and meets the evaluation bar.'}`,
  };
}

// ==============================================
// MASTER 3-STAGE INSIGHTS PIPELINE
//
// Stage 1: Gemini    → Transcript Analyzer
//          (facts, quotes, answer quality per Q)
//
// Stage 2: Cohere 1  → Strict Scorer
//          (0-100 scores with calibration rules)
//
// Stage 3: Cohere 2  → Verdict & Recommendation
//          (verdict, strengths, weaknesses, plan)
//
// Every stage has full AI + JS fallbacks.
// Result is cached in round.aiInsights — never rerun.
// ==============================================
async function generateRoundInsights(roundName, level, qaTranscript, existingSummary) {
  const TAG = '[INSIGHTS ENGINE]';
  const start = Date.now();
  console.log(`\n${TAG} ════════════════════════════════════`);
  console.log(`${TAG} Round: ${roundName} | Level: ${level} | QAs: ${qaTranscript.length}`);

  // Build trimmed transcript (max 10 Q&As, trimmed per entry)
  const transcriptText = qaTranscript
    .slice(0, 10)
    .map((qa, i) =>
      `Q${i + 1}: ${(qa.question || '').slice(0, 200)}\n` +
      `A${i + 1}: ${qa.answer && qa.answer.trim() ? qa.answer.slice(0, 300) : '(no answer given)'}`
    )
    .join('\n\n');

  const trimmedTranscript = trimToTokenBudget(transcriptText, 1000);

  // ─────────────────────────────────────────
  // STAGE 1 — GEMINI: Transcript Analyzer
  // ─────────────────────────────────────────
  let stage1 = null;
  let s1Method = 'none';

  const s1Prompt =
`You are a strict technical interview reviewer. Analyze this interview objectively — do not be optimistic.

INTERVIEW: ${roundName} round | ${level.toUpperCase()} level candidate

TRANSCRIPT:
${trimmedTranscript}

For each Q&A pair, analyze strictly. Return ONLY valid JSON (no markdown, no code block):
{
  "qAnalysis": [
    {"q": 1, "quality": "strong|adequate|weak|unanswered", "evidence": "brief direct quote from answer", "score": 0-10}
  ],
  "unansweredCount": <number of unanswered or "I don't know" responses>,
  "technicalErrors": <number of factually incorrect technical claims>,
  "communicationQuality": "excellent|good|average|poor",
  "observations": "2 factual, evidence-based sentences about the candidate"
}

SCORING GUIDE: 9-10=exceptional, 7-8=good, 5-6=average, 3-4=weak, 0-2=poor/unanswered.
IMPORTANT: Be strict. An average answer = 5. Do not give 8s for mediocre answers.`;

  console.log(`${TAG} Stage 1 → Gemini (${Math.ceil(s1Prompt.length / 4)} tokens)...`);
  const s1Raw = await _callGeminiDirect(s1Prompt, 700, 0.1);
  if (s1Raw) {
    try {
      stage1 = JSON.parse(s1Raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      s1Method = 'gemini';
      console.log(`${TAG} Stage 1 ✅ Gemini (${Date.now() - start}ms)`);
    } catch (e) {
      console.warn(`${TAG} Stage 1 Gemini parse error:`, e.message);
    }
  }

  if (!stage1) {
    console.log(`${TAG} Stage 1 → Cohere 1 fallback...`);
    const s1Raw2 = await _callCohereClient(cohere, 'cohere1', s1Prompt, 700, 0.1);
    if (s1Raw2) {
      try {
        stage1 = JSON.parse(s1Raw2.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        s1Method = 'cohere1';
        console.log(`${TAG} Stage 1 ✅ Cohere 1 fallback (${Date.now() - start}ms)`);
      } catch (e) {
        console.warn(`${TAG} Stage 1 Cohere 1 parse error:`, e.message);
      }
    }
  }

  if (!stage1) {
    console.log(`${TAG} Stage 1 → Deriving from stored summary (all AI failed)`);
    stage1 = _deriveStage1FromSummary(existingSummary || '', qaTranscript.length);
    s1Method = 'derived';
  }

  const unanswered = Math.max(0, stage1.unansweredCount || 0);
  const techErrors = Math.max(0, stage1.technicalErrors || 0);
  const commQuality = stage1.communicationQuality || 'average';

  // ─────────────────────────────────────────
  // STAGE 2 — COHERE 1: Strict Scorer
  // ─────────────────────────────────────────
  let stage2 = null;
  let s2Method = 'none';

  const s2Input = {
    answerSummary: (stage1.qAnalysis || []).map(q => ({ q: q.q, quality: q.quality, score: q.score })),
    unansweredCount: unanswered,
    technicalErrors: techErrors,
    communicationQuality: commQuality,
    observations: stage1.observations,
  };

  const s2Prompt =
`You are a senior hiring manager scoring a ${roundName} interview for a ${level.toUpperCase()} candidate.

TRANSCRIPT ANALYSIS:
${JSON.stringify(s2Input)}

CALIBRATION RULES (strictly apply):
- Average candidates: 45-55. Good: 60-70. Excellent: 75-85. Outstanding: 86-100.
- NEVER inflate scores. Realistic > optimistic.
- Unanswered questions: ${unanswered} detected → apply -4 per unanswered to overallScore
- Technical errors: ${techErrors} detected → apply -5 per error to technicalScore
- Communication quality: ${commQuality}

Return ONLY valid JSON (no markdown, no explanation):
{
  "technicalScore": 0-100,
  "communicationScore": 0-100,
  "problemSolvingScore": 0-100,
  "confidenceScore": 0-100,
  "overallScore": 0-100
}`;

  console.log(`${TAG} Stage 2 → Cohere 1 (Scorer)...`);
  const s2Raw = await _callCohereClient(cohere, 'cohere1', s2Prompt, 200, 0.1);
  if (s2Raw) {
    try {
      stage2 = JSON.parse(s2Raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      s2Method = 'cohere1';
      console.log(`${TAG} Stage 2 ✅ Cohere 1 (${Date.now() - start}ms)`);
    } catch (e) {
      console.warn(`${TAG} Stage 2 Cohere 1 parse error:`, e.message);
    }
  }

  if (!stage2) {
    console.log(`${TAG} Stage 2 → Cohere 2 fallback...`);
    const s2Raw2 = await _callCohereClient(cohere2, 'cohere2', s2Prompt, 200, 0.1);
    if (s2Raw2) {
      try {
        stage2 = JSON.parse(s2Raw2.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        s2Method = 'cohere2';
        console.log(`${TAG} Stage 2 ✅ Cohere 2 fallback (${Date.now() - start}ms)`);
      } catch (e) {
        console.warn(`${TAG} Stage 2 Cohere 2 parse error:`, e.message);
      }
    }
  }

  if (!stage2) {
    console.log(`${TAG} Stage 2 → Derived from Stage 1 (all AI failed)`);
    stage2 = _deriveStage2FromStage1(stage1);
    s2Method = 'derived';
  }

  // Apply anti-inflation penalties (always, regardless of source)
  stage2 = _applyScorePenalties(stage2, unanswered, techErrors, commQuality);
  console.log(`${TAG} Stage 2 final scores: overall=${stage2.overallScore} tech=${stage2.technicalScore} comm=${stage2.communicationScore}`);

  // ─────────────────────────────────────────
  // STAGE 3 — COHERE 2: Verdict & Plan
  // ─────────────────────────────────────────
  let stage3 = null;
  let s3Method = 'none';

  const s3Prompt =
`You are a Chief Talent Officer making the final hiring recommendation after reviewing a ${roundName} interview.

CANDIDATE SCORES (${level.toUpperCase()} level):
- Overall: ${stage2.overallScore}/100
- Technical: ${stage2.technicalScore}/100
- Communication: ${stage2.communicationScore}/100
- Problem Solving: ${stage2.problemSolvingScore}/100
- Confidence: ${stage2.confidenceScore}/100

INTERVIEWER OBSERVATIONS: ${stage1.observations || 'No observations'}
UNANSWERED QUESTIONS: ${unanswered}

VERDICT THRESHOLDS (strictly apply — do not deviate):
- 75-100 → "Strong Hire"
- 60-74  → "Hire"
- 45-59  → "Borderline"
- 0-44   → "No Hire"

Return ONLY valid JSON (no markdown):
{
  "overallVerdict": "Strong Hire|Hire|Borderline|No Hire",
  "topStrengths": ["evidence-based strength 1", "strength 2", "strength 3"],
  "criticalWeaknesses": ["specific weakness 1", "weakness 2", "weakness 3"],
  "improvementPlan": ["actionable step 1", "step 2", "step 3"],
  "narrativeSummary": "2 honest, realistic sentences about the candidate"
}

IMPORTANT: Be realistic, not encouraging. Mention specific evidence. Max 3 items each list.`;

  console.log(`${TAG} Stage 3 → Cohere 2 (Verdict)...`);
  const s3Raw = await _callCohereClient(cohere2, 'cohere2', s3Prompt, 450, 0.2);
  if (s3Raw) {
    try {
      stage3 = JSON.parse(s3Raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      s3Method = 'cohere2';
      console.log(`${TAG} Stage 3 ✅ Cohere 2 (${Date.now() - start}ms)`);
    } catch (e) {
      console.warn(`${TAG} Stage 3 Cohere 2 parse error:`, e.message);
    }
  }

  if (!stage3) {
    console.log(`${TAG} Stage 3 → Cohere 1 fallback...`);
    const s3Raw2 = await _callCohereClient(cohere, 'cohere1', s3Prompt, 450, 0.2);
    if (s3Raw2) {
      try {
        stage3 = JSON.parse(s3Raw2.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        s3Method = 'cohere1';
        console.log(`${TAG} Stage 3 ✅ Cohere 1 fallback (${Date.now() - start}ms)`);
      } catch (e) {
        console.warn(`${TAG} Stage 3 Cohere 1 parse error:`, e.message);
      }
    }
  }

  if (!stage3) {
    console.log(`${TAG} Stage 3 → Derived from scores (all AI failed)`);
    stage3 = _deriveStage3FromScores(stage2, stage1, roundName);
    s3Method = 'derived';
  }

  // ALWAYS enforce verdict matches score — AI sometimes contradicts itself
  stage3.overallVerdict = _enforceVerdictFromScore(stage2.overallScore);

  // ─────────────────────────────────────────
  // FINAL MIX — Combine all 3 stages
  // ─────────────────────────────────────────
  const totalMs = Date.now() - start;
  console.log(`${TAG} Pipeline complete in ${totalMs}ms | S1=${s1Method} S2=${s2Method} S3=${s3Method}`);
  console.log(`${TAG} Final: ${stage2.overallScore}% → ${stage3.overallVerdict}`);
  console.log(`${TAG} ════════════════════════════════════\n`);

  return {
    // Scores (from Stage 2 + penalties)
    overallScore:       stage2.overallScore,
    technicalScore:     stage2.technicalScore,
    communicationScore: stage2.communicationScore,
    problemSolvingScore:stage2.problemSolvingScore,
    confidenceScore:    stage2.confidenceScore,

    // Verdict & Narrative (from Stage 3)
    overallVerdict:     stage3.overallVerdict,
    topStrengths:       (stage3.topStrengths || []).slice(0, 3),
    criticalWeaknesses: (stage3.criticalWeaknesses || []).slice(0, 3),
    improvementPlan:    (stage3.improvementPlan || []).slice(0, 3),
    narrativeSummary:   stage3.narrativeSummary || '',

    // Evidence (from Stage 1)
    answerBreakdown:    stage1.qAnalysis || [],
    unansweredCount:    unanswered,
    totalQuestionsAsked:qaTranscript.length,

    // Pipeline metadata
    pipelineStages:     { stage1: s1Method, stage2: s2Method, stage3: s3Method },
    generatedAt:        new Date().toISOString(),
    processingTimeMs:   totalMs,
  };
}

// ==============================================
// EXPORTS
// ==============================================
module.exports = {
  gemini,
  openai,
  cohere,
  cohere2,
  TOTAL_QUESTIONS,
  callGemini,
  callOpenAI,
  callCohere,
  generateSummary,
  generateInterviewQuestion,
  generateRoundInsights,
  getHealthStatus,
};
