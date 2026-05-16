import express from "express";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error("CRITICAL: GEMINI_API_KEY is not set. Please add it to your .env file or environment variables.");
} else {
  console.log("GEMINI_API_KEY found.");
}

app.use(cors());
app.use(express.json());

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const SYSTEM_INSTRUCTION = `
You are Bework, a high-performance AI business partner. 
Your goal is to provide exceptional support, strategic insights, and operational assistance to professionals.

Guidelines:
1. Tone: Sophisticated, pro-active, and highly professional.
2. Capability: You assist with business strategy, customer relations, technical workflows, and sophisticated problem-solving.
3. Clarity: Provide structured, actionable advice.
4. Formatting: Use Markdown for optimal readability.
5. Reliability: Maintain strict professional standards. If context is missing, ask intelligent follow-up questions.
`;

// API routes
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const model = "gemini-3-flash-preview";
    
    console.log(`Generating content with model ${model}, history length: ${history?.length || 0}`);
    
    const contents = [
      ...(history || []),
      { role: "user", parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    console.log("Gemini response received");
    res.json({ text: response.text });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate response" });
  }
});

// Streaming endpoint for better UX
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const model = "gemini-3-flash-preview";
    console.log(`Streaming content with model ${model}, history length: ${history?.length || 0}`);
    
    const contents = [
      ...(history || []),
      { role: "user", parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error: any) {
    console.error("Gemini Stream Error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Failed to stream response" })}\n\n`);
    res.end();
  }
});

// Vite middleware setup
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
