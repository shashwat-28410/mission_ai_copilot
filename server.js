import express from "express";
import cors from "cors";
import OpenAI from "openai";
import connectDb from "./config/Db.js";
import dotenv from "dotenv";

dotenv.config();

// connect DB if needed
connectDb();

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// health check
app.get("/", (req, res) => {
  res.send("Mission Copilot backend is online ✅");
});

app.post("/api/copilot", async (req, res) => {
  try {
    const {
      command,
      message,
      telemetry,
      history,
      crewVitals,
      dashboardMetrics,
      mission,          // NEW — mission state from frontend
    } = req.body || {};

    const userCommand =
      command ||
      message ||
      "Give a short status update about ship systems, trajectory, and crew health.";

    // --------------------------------------------------------------------
    // TELEMETRY VALUES
    // --------------------------------------------------------------------
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
      typeof co2 === "number" && !Number.isNaN(co2)
        ? `${Math.round(co2)} ppm`
        : "unknown";

    const o2Value =
      typeof o2 === "number" && !Number.isNaN(o2)
        ? `${o2.toFixed(1)} kPa`
        : "unknown";

    const battValue =
      typeof batt === "number" && !Number.isNaN(batt)
        ? `${Math.round(batt)} %`
        : "unknown";

    const velocityValue =
      typeof velocity === "number" && !Number.isNaN(velocity)
        ? `${Math.round(velocity)} km/h`
        : "unknown";

    const distEarthValue =
      typeof distanceFromEarth === "number" && !Number.isNaN(distanceFromEarth)
        ? `${Math.round(distanceFromEarth).toLocaleString()} km`
        : "unknown";

    const distMoonValue =
      typeof distanceFromMoon === "number" && !Number.isNaN(distanceFromMoon)
        ? `${Math.round(distanceFromMoon).toLocaleString()} km`
        : "unknown";

    const trajectoryPhaseValue =
      typeof trajectoryPhase === "string" && trajectoryPhase.trim().length > 0
        ? trajectoryPhase
        : "unknown phase";

    // --------------------------------------------------------------------
    // DASHBOARD METRICS (PAGE 1)
    // --------------------------------------------------------------------
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

    // --------------------------------------------------------------------
    // CREW VITALS
    // --------------------------------------------------------------------
    let crewSummary = "Crew vitals feed unavailable.";
    if (Array.isArray(crewVitals) && crewVitals.length > 0) {
      crewSummary = crewVitals
        .map((c) => {
          const pulse =
            typeof c.pulse === "number" ? `${Math.round(c.pulse)} bpm` : "n/a";
          const bpSys =
            typeof c.bpSys === "number" ? Math.round(c.bpSys) : "n/a";
          const bpDia =
            typeof c.bpDia === "number" ? Math.round(c.bpDia) : "n/a";
          return `${c.name} (${c.role}) – pulse ${pulse}, BP ${bpSys}/${bpDia}`;
        })
        .join("\n");
    }

    // --------------------------------------------------------------------
    // MISSION STATE (NEW)
    // --------------------------------------------------------------------
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

    // --------------------------------------------------------------------
    // SYSTEM + CONTEXT PROMPT
    // --------------------------------------------------------------------
    const messages = [
      {
        role: "system",
        content: `
You are **MISSION COPILOT**, an advanced operational AI assisting a lunar tourism spacecraft.

You ALWAYS answer based on actual mission state JSON provided below.

You know:
- Full telemetry (CO2, O2, battery, velocity, distances, trajectory phase)
- Dashboard metrics (fuel, power, orbital stability, cabin integrity, comms)
- Crew vitals
- Mission simulation values:
    • missionTimeSec – seconds elapsed in mission simulation  
    • missionProgressPercent – overall mission progress  
    • timeScale – simulation warp factor (1×, 10×, 100×…)  
    • currentPhaseLabel – launch, coast, LOI, orbit, etc.  
    • emergencyMode – "none", "abort", or "landing"  
    • thrusterBoost – positive or negative burn strength  
    • achievements – events completed (optional)

Important simulation rules:
- Thrusters **consume extra fuel** and can reduce orbital stability.
- High warp (timeScale > 10) **accelerates fuel & power drain**.
- Emergency landing **burns fuel rapidly**, lowers stability, and reduces comms clarity.
- Abort mode stabilizes the craft but uses controlled burns.
- Trajectory is Apollo-style with TLI, cruise, MCC, SOI shift, LOI, and lunar orbit.

When the user asks:
- “Do thrusters affect fuel?” → **YES**, explain based on fuel% and thrusterBoost.
- “How is emergency landing affecting us?” → Explain fuel, stability, descent.
- “How fast are we progressing?” → Use missionProgressPercent and timeScale.
- “What phase are we in?” → Use currentPhaseLabel.
- “How is comms quality?” → Use comms%.
- “How long until next phase?” → Reason using missionProgress and typical lunar mission structure.

Tone:
- Professional, calm, cinematic, Apollo-era + sci-fi hybrid.
- 2–6 sentences unless user requests otherwise.
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
Trajectory phase: ${trajectoryPhaseValue}`,
      },

      {
        role: "system",
        content: `Dashboard Metrics:
Fuel: ${fuelPct}
Power: ${powerPct}
Orbital Stability: ${orbitPct}
Cabin Integrity: ${cabinPct}
Comms Quality: ${commsPct}`,
      },

      {
        role: "system",
        content: `Mission State:
Mission Time: ${missionTime} sec
Progress: ${missionProgress}
Warp Factor: ${warp}×
Current Phase: ${phaseLabel}
Thruster Boost: ${thrusterBoost}
Emergency Mode: ${emergencyMode}`,
      },

      {
        role: "system",
        content: `Crew Vitals:
${crewSummary}`,
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

    // --------------------------------------------------------------------
    // CALL OPENAI
    // --------------------------------------------------------------------
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.35,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ??
      "Mission Copilot online, but I could not generate a detailed response right now.";

    res.json({ reply });
  } catch (err) {
    console.error("❌ Copilot backend error:", err);
    res.status(500).json({
      error: "Error from AI copilot backend.",
      details: err?.message || "Unknown error",
    });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 AI Mission Copilot backend running at http://localhost:${PORT}`);
});
