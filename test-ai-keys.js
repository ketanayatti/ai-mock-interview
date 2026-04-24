require('dotenv').config();
const { gemini, callOpenAI, callCohere } = require('./src/config/aiServices');

async function testGemini() {
    console.log("Testing Gemini API models...");
    if (!process.env.GEMINI_API_KEY) {
        console.log("⚠️ Gemini: SKIPPED (No GEMINI_API_KEY provided)\n");
        return;
    }
    const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-2.5-flash"];
    for (const model of models) {
        try {
            console.log(`  -> Testing ${model}...`);
            const result = await gemini.models.generateContent({
                model: model,
                contents: "Respond 'OK'",
            });
            if (result && result.text) {
                console.log(`  ✅ ${model}: SUCCESS`);
            } else {
                console.log(`  ❌ ${model}: FAILED - No text returned`);
            }
        } catch (e) {
            console.error(`  ❌ ${model}:`, e.message);
        }
    }
    console.log();
}

async function testOpenAI() {
    console.log("Testing OpenAI API...");
    if (!process.env.OPENAI_API_KEY) {
        console.log("⚠️ OpenAI: SKIPPED (No OPENAI_API_KEY provided)\n");
        return;
    }
    try {
        const result = await callOpenAI("Respond with exactly these words: 'OpenAI is working.'");
        if (result) {
            console.log("✅ OpenAI: SUCCESS");
            console.log("   Response:", result, "\n");
        } else {
            console.log("❌ OpenAI: FAILED - No response returned\n");
        }
    } catch (e) {
        console.error("❌ OpenAI: FAILED -", e.message, "\n");
    }
}

async function testCohere() {
    console.log("Testing Cohere API 1...");
    if (!process.env.COHERE_API_KEY) {
        console.log("⚠️ Cohere 1: SKIPPED (No COHERE_API_KEY provided)\n");
        return;
    }
    try {
        const result = await callCohere("Respond with exactly these words: 'Cohere 1 is working.'");
        if (result) {
            console.log("✅ Cohere 1: SUCCESS");
            console.log("   Response:", result, "\n");
        } else {
            console.log("❌ Cohere 1: FAILED - No response returned\n");
        }
    } catch (e) {
        console.error("❌ Cohere 1: FAILED -", e.message, "\n");
    }
}

async function testCohere2() {
    console.log("Testing Cohere API 2...");
    if (!process.env.COHERE_API_KEY_2) {
        console.log("⚠️ Cohere 2: SKIPPED (No COHERE_API_KEY_2 provided)\n");
        return;
    }
    try {
        const { CohereClientV2 } = require("cohere-ai");
        const cohere2 = new CohereClientV2({ token: process.env.COHERE_API_KEY_2 });
        const response = await cohere2.chat({
            model: "command-a-03-2025",
            messages: [{ role: "user", content: "Respond with exactly these words: 'Cohere 2 is working.'" }],
        });
        
        if (response && response.message && response.message.content) {
            console.log("✅ Cohere 2: SUCCESS");
            console.log("   Response:", response.message.content[0].text.trim(), "\n");
        } else {
             console.log("❌ Cohere 2: FAILED - Unexpected response format\n");
        }
    } catch (e) {
        console.error("❌ Cohere 2: FAILED -", e.message, "\n");
    }
}

async function runAllTests() {
    console.log("=========================================");
    console.log("      AI API KEYS CONNECTION TEST        ");
    console.log("=========================================\n");
    
    await testGemini();
    await testOpenAI();
    await testCohere();
    await testCohere2();
    
    console.log("=========================================");
    console.log("              TESTS COMPLETE             ");
    console.log("=========================================\n");
    process.exit(0);
}

runAllTests();
