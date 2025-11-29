import express from "express";
import cors from "cors";
import OpenAI from "openai";
import connectDb from "./config/Db.js";
import dotenv from "dotenv";

dotenv.config();

connectDb();

const app = express();
app.use(cors());
app.use(express.json());


const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// API endpoint used by the frontend
app.post("/api/copilot", async (req, res) => {
  try {
    const { command, telemetry, history } = req.body || {};
    console.log("Received command:", command);
    const { co2, o2, batt } = telemetry || {};

    const messages = [
      {
        role: "system",
        content: `
You are an AI Mission Copilot assisting astronauts and mission control.

You see live telemetry:
- CO₂ level in ppm
- O₂ cabin pressure in kPa
- Battery state of charge in %

Use these CO₂ bands (spacecraft cabin context):
- Normal:   up to about 3000 ppm (typical operating range)
- Elevated: 3000–6000 ppm (above nominal; crew may feel symptoms)
- Critical: above about 6000 ppm (requires prompt action)

Your goals:
- Explain current status clearly and concisely.
- If there is risk (high CO₂, low battery), propose concrete, realistic actions.
- If the user is running a CO₂ filter swap procedure, explain each step briefly and safely.
- Always be calm, safety-focused, and avoid panic.
- Respond in 2–5 short sentences.
        `.trim(),
      },
      {
        role: "system",
        content: `Current telemetry:
CO₂: ${co2} ppm
O₂: ${o2} kPa
Battery: ${batt} %`,
      },
      ...(Array.isArray(history)
        ? history.slice(-8).map((h) => ({
          role: h.role,
          content: h.content,
        }))
        : []),
      {
        role: "user",
        content: command || "Provide a short status update for the crew.",
      },
    ];
    console.log("Constructed messages for OpenAI:", messages);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // change to gpt-4.1 or others if your account supports
      messages,
      temperature: 0.4,
    });

    const reply =
      completion.choices?.[0]?.message?.content ??
      "I could not generate a response right now.";

    res.json({ reply });
  } catch (err) {
    console.error("Copilot backend error:", err);
    res.status(500).json({ error: "Error from AI copilot backend." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 AI Mission Copilot backend running on port", PORT);
});
