// config/aiServices.js — Centralized AI service initialization
const { GoogleGenAI } = require("@google/genai");

// Initialize Gemini (always required)
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize OpenAI (optional — graceful fallback if not configured)
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    const OpenAI = require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (e) {
  console.warn("OpenAI SDK not available:", e.message);
}

// Initialize Cohere 1 (Primary - Resume Summary & Interview Questions)
let cohere = null;
try {
  if (process.env.COHERE_API_KEY) {
    const { CohereClientV2 } = require("cohere-ai");
    cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });
  }
} catch (e) {
  console.warn("Cohere SDK not available:", e.message);
}

// Initialize Cohere 2 (Secondary - Interview Summary & Performance Score)
let cohere2 = null;
try {
  if (process.env.COHERE_API_KEY_2) {
    const { CohereClientV2 } = require("cohere-ai");
    cohere2 = new CohereClientV2({ token: process.env.COHERE_API_KEY_2 });
  }
} catch (e) {
  console.warn("Cohere 2 SDK not available:", e.message);
}

// =====================
// AI Helper Functions
// =====================

async function callGemini(prompt, taskType = "general") {
  // 1. EVALUATION TASKS (use Cohere 2)
  if (taskType === "evaluation" && cohere2) {
    console.log("[API 2] Using Cohere 2 for performance evaluation...");
    const res = await callCohereClient(cohere2, prompt);
    if (res) return res;
  } 
  // 2. GENERAL TASKS (use Cohere 1)
  else if (taskType !== "evaluation" && cohere) {
    console.log("[API 1] Using Cohere 1 for resume summary / interview generation...");
    const res = await callCohereClient(cohere, prompt);
    if (res) return res;
  }

  // 3. CROSS-FALLBACK (If Cohere 2 fails, use Cohere 1, and vice versa)
  if (taskType === "evaluation" && cohere) {
    console.log("[API 1 FALLBACK] Cohere 2 failed, falling back to Cohere 1...");
    const res = await callCohereClient(cohere, prompt);
    if (res) return res;
  } else if (taskType !== "evaluation" && cohere2) {
    console.log("[API 2 FALLBACK] Cohere 1 failed, falling back to Cohere 2...");
    const res = await callCohereClient(cohere2, prompt);
    if (res) return res;
  }

  // 4. LAST RESORT BACKUP (Gemini 2.5 flash, then OpenAI)
  console.log("[BACKUP] Both Cohere instances exhausted. Falling back to Gemini 2.5...");
  try {
    const result = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return result.text.trim();
  } catch (err) {
    console.warn(`Gemini 2.5 Backup failed:`, err.message || err.status || "Unknown error");
  }

  if (openai) {
    console.log("[BACKUP] Cohere & Gemini failed. Falling back to OpenAI...");
    const fallbackOpenAI = await callOpenAI(prompt);
    if (fallbackOpenAI) return fallbackOpenAI;
  }

  console.error("CRITICAL: All AI providers failed.");
  throw new Error("All AI providers exhausted.");
}

async function callOpenAI(prompt) {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("OpenAI API error:", err.message);
    return null;
  }
}

async function callCohereClient(client, prompt) {
  try {
    const response = await client.chat({
      model: "command-a-03-2025",
      messages: [{ role: "user", content: prompt }],
    });
    return response.message.content[0].text.trim();
  } catch (err) {
    console.error("Cohere API error:", err.message);
    return null;
  }
}

// Keep callCohere as a generic wrapper for backwards compatibility
async function callCohere(prompt) {
  if (cohere) return await callCohereClient(cohere, prompt);
  return null;
}

module.exports = { gemini, openai, cohere, callGemini, callOpenAI, callCohere };
