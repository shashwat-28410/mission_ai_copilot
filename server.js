import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import connectDb from "./config/Db.js";

dotenv.config();

const app = express();

// -----------------------------
// MIDDLEWARE
// -----------------------------
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// -----------------------------
// OPENAI CLIENT
// -----------------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -----------------------------
// HEALTH CHECK
// -----------------------------
app.get("/", (req, res) => {
  res.send("Mission Copilot backend is online ✅");
});

// -----------------------------
// MAIN AI ROUTE
// -----------------------------
app.post("/api/copilot", async (req, res) => {
  try {
    const {
      command,
      message,
      telemetry,
      history,
      crewVitals,
      dashboardMetrics,
      mission,
    } = req.body || {};

    const userCommand =
      command ||
      message ||
      "Give a short status update about ship systems, trajectory, and crew health.";

    // ------------------------------------------------------------
    //  TELEMETRY
    // ------------------------------------------------------------
    const {
      co2,
      o2,
      batt,
      velocity,
      distanceFromEarth,
      distanceFromMoon,
      trajectoryPhase,
    } = telemetry || {};

    const co2Value =
      typeof co2 === "number" ? `${Math.round(co2)} ppm` : "unknown";

    const o2Value =
      typeof o2 === "number" ? `${o2.toFixed(1)} kPa` : "unknown";

    const battValue =
      typeof batt === "number" ? `${Math.round(batt)} %` : "unknown";

    const velocityValue =
      typeof velocity === "number" ? `${Math.round(velocity)} km/h` : "unknown";

    const distEarthValue =
      typeof distanceFromEarth === "number"
        ? `${Math.round(distanceFromEarth).toLocaleString()} km`
        : "unknown";

    const distMoonValue =
      typeof distanceFromMoon === "number"
        ? `${Math.round(distanceFromMoon).toLocaleString()} km`
        : "unknown";

    const trajectoryPhaseValue =
      typeof trajectoryPhase === "string" && trajectoryPhase.trim()
        ? trajectoryPhase
        : "unknown phase";

    // ------------------------------------------------------------
    // DASHBOARD METRICS
    // ------------------------------------------------------------
    const dm = dashboardMetrics || {};

    const fuelPct =
      typeof dm.fuel === "number" ? `${Math.round(dm.fuel)} %` : "unknown";

    const powerPct =
      typeof dm.power === "number" ? `${Math.round(dm.power)} %` : "unknown";

    const orbitPct =
      typeof dm.orbit === "number" ? `${Math.round(dm.orbit)} %` : "unknown";

    const cabinPct =
      typeof dm.cabin === "number" ? `${Math.round(dm.cabin)} %` : "unknown";

    const commsPct =
      typeof dm.comms === "number" ? `${Math.round(dm.comms)} %` : "unknown";

    // ------------------------------------------------------------
    // CREW VITALS
    // ------------------------------------------------------------
    let crewSummary = "Crew vitals feed unavailable.";
    if (Array.isArray(crewVitals) && crewVitals.length > 0) {
      crewSummary = crewVitals
        .map((c) => {
          const pulse = typeof c.pulse === "number" ? `${Math.round(c.pulse)} bpm` : "n/a";
          const bpSys = typeof c.bpSys === "number" ? Math.round(c.bpSys) : "n/a";
          const bpDia = typeof c.bpDia === "number" ? Math.round(c.bpDia) : "n/a";

          return `${c.name} (${c.role}) – pulse ${pulse}, BP ${bpSys}/${bpDia}`;
        })
        .join("\n");
    }

    // ------------------------------------------------------------
    // MISSION SIMULATION STATE
    // ------------------------------------------------------------
    const ms = mission || {};

    const missionTime = ms.missionTimeSec ?? "unknown";

    const missionProgress =
      typeof ms.missionProgressPercent === "number"
        ? `${Math.round(ms.missionProgressPercent * 100)} %`
        : "unknown";

    const warp = ms.timeScale ?? 1;
    const thrusterBoost =
      typeof ms.thrusterBoost === "number" ? ms.thrusterBoost : 0;

    const emergencyMode = ms.emergencyMode || "none";
    const phaseLabel = ms.currentPhaseLabel || "unknown phase";

    // ------------------------------------------------------------
    // SYSTEM PROMPT
    // ------------------------------------------------------------
    const messages = [
      {
        role: "system",
        content: `
You are MISSION COPILOT, an advanced AI for a lunar tourism spacecraft.

You must ALWAYS base answers ONLY on the telemetry + mission JSON supplied here.

Mission Simulation Rules:
- Thrusters affect fuel and orbital stability.
- Warp factor increases all resource drain.
- Emergency landing reduces fuel FAST and lowers comms.
- Abort mode stabilizes the spacecraft but halts mission phases.
- Use missionProgressPercent and timeScale to predict phase timing.

Tone: Calm, precise, cinematic, Apollo + sci-fi hybrid.  
Limit normal answers to 2–6 sentences.

Use the provided values exactly as truth.
        `.trim(),
      },

      {
        role: "system",
        content: `Telemetry:
CO₂: ${co2Value}
O₂: ${o2Value}
Battery: ${battValue}
Velocity: ${velocityValue}
Distance from Earth: ${distEarthValue}
Distance to Moon: ${distMoonValue}
Trajectory phase: ${trajectoryPhaseValue}`
      },

      {
        role: "system",
        content: `Dashboard Metrics:
Fuel: ${fuelPct}
Power: ${powerPct}
Orbital Stability: ${orbitPct}
Cabin Integrity: ${cabinPct}
Comms Quality: ${commsPct}`
      },

      {
        role: "system",
        content: `Mission State:
Mission Time: ${missionTime} sec
Progress: ${missionProgress}
Warp Factor: ${warp}×
Current Phase: ${phaseLabel}
Thruster Boost: ${thrusterBoost}
Emergency Mode: ${emergencyMode}`
      },

      {
        role: "system",
        content: `Crew Vitals:\n${crewSummary}`
      },

      ...(Array.isArray(history)
        ? history.slice(-8).map((h) => ({
            role: h.role,
            content: h.content,
          }))
        : []),

      {
        role: "user",
        content: userCommand,
      },
    ];

    // ------------------------------------------------------------
    // OPENAI CALL
    // ------------------------------------------------------------
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.35,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Mission Copilot online, but I could not generate a detailed response.";

    res.json({ reply });

  } catch (err) {
    console.error("❌ Copilot backend error:", err);
    res.status(500).json({
      error: "Error from AI copilot backend",
      details: err.message || "Unknown error",
    });
  }
});

// -----------------------------
// START SERVER + SAFE DB CONNECT
// -----------------------------
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 AI Mission Copilot backend running at http://localhost:${PORT}`);

  // SAFE DB CONNECTION — will NOT crash backend
  connectDb().catch((err) => {
    console.error("⚠️ MongoDB connection failed (backend still running):", err.message);
  });
});
