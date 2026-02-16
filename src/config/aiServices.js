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

// Initialize Cohere (optional — graceful fallback if not configured)
let cohere = null;
try {
  if (process.env.COHERE_API_KEY) {
    const { CohereClientV2 } = require("cohere-ai");
    cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });
  }
} catch (e) {
  console.warn("Cohere SDK not available:", e.message);
}

// =====================
// AI Helper Functions
// =====================

async function callGemini(prompt) {
  const result = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  return result.text.trim();
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

async function callCohere(prompt) {
  if (!cohere) return null;
  try {
    const response = await cohere.chat({
      model: "command-a-03-2025",
      messages: [{ role: "user", content: prompt }],
    });
    return response.message.content[0].text.trim();
  } catch (err) {
    console.error("Cohere API error:", err.message);
    return null;
  }
}

module.exports = { gemini, openai, cohere, callGemini, callOpenAI, callCohere };
