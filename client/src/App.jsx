import React, { useEffect, useRef, useState } from "react";

const BACKEND_URL = "http://localhost:8080/api/copilot";

// -------------------- MISSION CONSTANTS --------------------
const MOON_DISTANCE_KM = 384400;
const MISSION_DURATION_SEC = 48 * 60 * 60; // 2 days

// 0–1 normalized progress values along the mission timeline
const MISSION_PHASES = [
  {
    id: "prelaunch",
    label: "PRE-LAUNCH",
    startProgress: 0.0,
    onEnter:
      "Mission Copilot online. All systems booting for two day lunar excursion.",
  },
  {
    id: "launch",
    label: "LAUNCH ASCENT",
    startProgress: 0.01,
    onEnter:
      "Ignition sequence start. Liftoff! We are leaving Earth, Commander.",
  },
  {
    id: "atmosphere-exit",
    label: "ATMOSPHERE EXIT",
    startProgress: 0.03,
    onEnter:
      "We have cleared the upper atmosphere. Welcome to the edge of space.",
  },
  {
    id: "earth-orbit",
    label: "EARTH ORBIT",
    startProgress: 0.06,
    onEnter:
      "We are in stable low Earth orbit. Navigation is preparing our translunar injection.",
  },
  {
    id: "tli-burn",
    label: "TLI BURN",
    startProgress: 0.1,
    onEnter:
      "Translunar injection burn has started. We are accelerating out of Earth orbit toward the Moon.",
  },
  {
    id: "trans-lunar-coast",
    label: "TRANS-LUNAR COAST",
    startProgress: 0.18,
    onEnter:
      "Translunar injection complete. We are now in translunar coast, trajectory nominal.",
  },
  {
    id: "halfway",
    label: "HALFWAY TO MOON",
    startProgress: 0.4,
    onEnter:
      "We are halfway between Earth and Moon. Gravity from both worlds is nearly balanced.",
  },
  {
    id: "lunar-soi",
    label: "LUNAR SOI ENTRY",
    startProgress: 0.6,
    onEnter:
      "We have entered the Moon’s sphere of influence. Lunar gravity is now dominant.",
  },
  {
    id: "loi-burn",
    label: "LUNAR ORBIT INSERTION",
    startProgress: 0.78,
    onEnter:
      "Lunar orbit insertion burn has begun. We are slowing down for lunar capture.",
  },
  {
    id: "lunar-orbit",
    label: "LUNAR ORBIT",
    startProgress: 0.85,
    onEnter:
      "Commander, we are in stable lunar orbit. Welcome to the Moon’s neighborhood.",
  },
  {
    id: "tour-phase",
    label: "LUNAR TOUR ORBITS",
    startProgress: 0.92,
    onEnter:
      "We are now in lunar tour phase. This is the best time for passengers to enjoy the views.",
  },
  {
    id: "mission-complete",
    label: "MISSION COMPLETE",
    startProgress: 0.99,
    onEnter:
      "Mission elapsed time forty eight hours. All primary lunar objectives achieved.",
  },
];

const SPECIAL_EVENTS = [
  {
    id: "solar-flare",
    label: "Minor solar flare detected – radiation shields holding within safe limits.",
    triggerProgress: 0.22,
  },
  {
    id: "comms-drop",
    label: "Brief communications dropout – link with Earth restored.",
    triggerProgress: 0.55,
  },
  {
    id: "micrometeor",
    label: "Micrometeorite cluster passed – hull integrity remains nominal.",
    triggerProgress: 0.73,
  },
];

function getPhaseForProgress(progress) {
  const p = clamp(progress, 0, 1);
  let current = MISSION_PHASES[0];
  for (const phase of MISSION_PHASES) {
    if (p >= phase.startProgress) current = phase;
    else break;
  }
  return current;
}

// crew list with roles
const CREW = [
  { name: "Rajveer", role: "Mission Commander" },
  { name: "Rithull", role: "Navigation Specialist" },
  { name: "Samrat", role: "Flight Engineer" },
  { name: "Krishna", role: "Payload Specialist" },
  { name: "Lochita", role: "Life Support Officer" },
  { name: "Yashashwini", role: "Medical Officer" },
];

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function formatMissionTime(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (x) => (x < 10 ? "0" + x : "" + x);
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

function formatEta(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return "< 1 min";
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (_) {
    // ignore audio errors
  }
}

function App() {
  const [view, setView] = useState("dashboard"); // "dashboard" | "telemetry" | "mission"

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [status, setStatus] = useState();
  const [error, setError] = useState("");

  const [history, setHistory] = useState([]);
  const [speechReady, setSpeechReady] = useState(false);
  const [ttsReady, setTtsReady] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);

  // dashboard metrics
  const [metrics, setMetrics] = useState({
    fuel: 82,
    power: 93,
    orbit: 76,
    cabin: 100,
    comms: 88,
  });

  // telemetry
  const [telemetry, setTelemetry] = useState({
    velocity: 27650,
    insideTemp: 22.5,
    outsideTemp: -160,
    o2: 98.2,
    co2: 0.04,
    distanceFromEarth: 200,
    distanceFromMoon: MOON_DISTANCE_KM - 200,
    trajectoryPhase: "PRE-LAUNCH",
  });

  // mission time + warp
  const [missionTimeSec, setMissionTimeSec] = useState(0);
  const [timeScale, setTimeScale] = useState(1);
  const [customScaleInput, setCustomScaleInput] = useState("1");
  const [currentPhaseId, setCurrentPhaseId] = useState(MISSION_PHASES[0].id);

  const [emergencyMode, setEmergencyMode] = useState("none"); // "none" | "abort" | "landing"
  const [emergencyProgress, setEmergencyProgress] = useState(0); // 0–1 for landing anim
  const [thrusterBoost, setThrusterBoost] = useState(0); // km/h offset
  const [achievements, setAchievements] = useState([]);

  // crew vitals
  const [crewVitals] = useState(
    CREW.map((member, idx) => ({
      ...member,
      pulse: 72 + idx * 3,
      bpSys: 118 + idx * 2,
      bpDia: 76 + idx,
    }))
  );

  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const missionRunningRef = useRef(true);
  const lastFrameTimeRef = useRef(null);
  const lastAnnouncedPhaseRef = useRef(null);
  const firedEventsRef = useRef(new Set());

  // ------------------------------------------------------------
  // SMART COMMAND INTERPRETER
  // ------------------------------------------------------------
  function preprocessCommand(text) {
    if (!text) return text;

    const t = text.toLowerCase().trim();

    if (
      t.includes("status") ||
      t.includes("full report") ||
      t.includes("mission report") ||
      t.includes("give me everything") ||
      t.includes("overall") ||
      t.includes("what's going on")
    ) {
      return "Provide a complete mission status including velocity, distance from Earth, distance to Moon, trajectory phase, O2, CO2, cabin integrity, fuel reserves, power grid, orbital stability, comms quality, and crew vitals with pulse and blood pressure.";
    }

    if (
      t.includes("crew") &&
      (t.includes("vitals") ||
        t.includes("pulse") ||
        t.includes("bp") ||
        t.includes("blood"))
    ) {
      return "Give detailed crew vitals including names, roles, pulse rate, and blood pressure for all six members.";
    }

    if (t.includes("distance")) {
      return "Report the spacecraft's distance from Earth and distance to the Moon, with trajectory phase.";
    }

    if (t.includes("fuel") || t.includes("power")) {
      return "Report fuel reserves, power grid level, and system stability.";
    }

    if (t.includes("velocity") || t.includes("speed")) {
      return "Report the spacecraft's velocity in km/h and km/s.";
    }

    return text;
  }

  // ------------------------------------------------------------
  // SPEECH RECOGNITION
  // ------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechReady(false);
      setError("Speech recognition not available.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus();
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ");

      const cleaned = preprocessCommand(transcript);

      setUserText(cleaned);
      setHistory((prev) => [
        ...prev,
        { sender: "YOU", text: cleaned, time: new Date().toLocaleTimeString() },
      ]);

      sendToBackend(cleaned);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!isSpeaking && !isLoading) {
        setStatus();
      }
    };

    recognition.onerror = (e) => {
      console.error(e);
      setError("Speech recognition error: " + e.error);
    };

    recognitionRef.current = recognition;
    setSpeechReady(true);
  }, []);

  // ------------------------------------------------------------
  // TTS: INIT VOICES
  // ------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setTtsReady(false);
      return;
    }

    const synth = window.speechSynthesis;

    const handleVoicesChanged = () => {
      const voices = synth.getVoices();
      voicesRef.current = voices;
      setTtsReady(voices.length > 0);
    };

    handleVoicesChanged();
    synth.addEventListener("voiceschanged", handleVoicesChanged);

    return () => {
      synth.removeEventListener("voiceschanged", handleVoicesChanged);
    };
  }, []);

  // ------------------------------------------------------------
  // BACKEND SEND
  // ------------------------------------------------------------
  async function sendToBackend(command) {
    if (!command || !command.trim()) return;

    try {
      setIsLoading(true);
      setStatus("CONTACTING AI CORE...");

      const payload = {
        command,
        telemetry,
        dashboardMetrics: metrics,
        crewVitals,
        history: history.map((h) => ({
          role: h.sender === "YOU" ? "user" : "assistant",
          content: h.text,
        })),
      };

      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Backend error: " + res.status);
      }

      const data = await res.json();
      const reply = data.reply || "No response.";

      setAssistantText(reply);

      setHistory((prev) => [
        ...prev,
        { sender: "COPILOT", text: reply, time: new Date().toLocaleTimeString() },
      ]);

      setBackendOnline(true);
      speakText(reply);
    } catch (err) {
      console.error(err);
      setBackendOnline(false);
      setError("AI CORE OFFLINE");
      setStatus("LINK FAILURE");
    } finally {
      setIsLoading(false);
    }
  }

  // ------------------------------------------------------------
  // TEXT → SPEECH
  // ------------------------------------------------------------
  const speakText = (text) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setError("Text-to-speech not supported in this browser.");
      setTtsReady(false);
      return;
    }

    if (!text || !text.trim()) return;

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    let voices = voicesRef.current;
    if (!voices || voices.length === 0) {
      voices = synth.getVoices();
      voicesRef.current = voices;
    }

    if (voices && voices.length > 0) {
      const preferredNames = [
        "Google US English",
        "Google UK English Male",
        "Microsoft David Desktop",
        "Microsoft Mark",
      ];

      const lowerPreferred = preferredNames.map((n) => n.toLowerCase());

      const byPreferred = voices.find((v) =>
        lowerPreferred.includes(v.name.toLowerCase())
      );

      const byLangMale = voices.find(
        (v) =>
          v.lang &&
          v.lang.toLowerCase().startsWith("en") &&
          v.name.toLowerCase().includes("male")
      );

      const byLang = voices.find(
        (v) => v.lang && v.lang.toLowerCase().startsWith("en")
      );

      utterance.voice = byPreferred || byLangMale || byLang || voices[0];
    }

    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setStatus("VOICE OUTPUT ACTIVE");
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      if (!isListening && !isLoading) {
        setStatus();
      }
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      setError("Speech synthesis error: " + (event.error || "unknown"));
      setIsSpeaking(false);
    };

    synth.speak(utterance);
  };

  // ------------------------------------------------------------
  // MISSION SIMULATION LOOP
  // ------------------------------------------------------------
  // ---------------- MISSION LOOP (NEW, SIMPLE) ----------------
useEffect(() => {
  const TICK_MS = 100;        // update every 0.1s of real time
  const BASE_RATE = 60;       // 1× warp = 60 mission seconds per real second

  let cancelled = false;

  const intervalId = setInterval(() => {
    if (cancelled) return;

    setMissionTimeSec((prev) => {
      if (emergencyMode !== "none") return prev;

      const deltaRealSec = TICK_MS / 1000;
      const deltaMission = deltaRealSec * timeScale * BASE_RATE;

      const next = prev + deltaMission;
      return next >= MISSION_DURATION_SEC ? MISSION_DURATION_SEC : next;
    });
  }, TICK_MS);

  return () => {
    cancelled = true;
    clearInterval(intervalId);
  };
}, [timeScale, emergencyMode]);


  // emergency landing progression (visual only)
  useEffect(() => {
    if (emergencyMode !== "landing") {
      setEmergencyProgress(0);
      return;
    }

    let start = null;
    const durationMs = 120000; // 2 minutes real-time landing anim
    let rafId;

    function step(ts) {
      if (start == null) start = ts;
      const t = clamp((ts - start) / durationMs, 0, 1);
      setEmergencyProgress(t);
      if (t < 1 && emergencyMode === "landing") {
        rafId = requestAnimationFrame(step);
      }
    }

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [emergencyMode]);

  // recompute telemetry + metrics + phase from mission time
  useEffect(() => {
    const baseProgress = clamp(missionTimeSec / MISSION_DURATION_SEC, 0, 1);

    // mission normal distance
    const minLEO = 200;
    let distanceFromEarth =
      minLEO + baseProgress * (MOON_DISTANCE_KM - minLEO);
    let distanceFromMoon = Math.max(MOON_DISTANCE_KM - distanceFromEarth, 0);

    // velocity profile (base)
    let velocityBase;
    if (baseProgress < 0.1) {
      velocityBase = 0 + baseProgress * 80000;
    } else if (baseProgress < 0.8) {
      velocityBase = 28000 + Math.sin(baseProgress * Math.PI) * 3000;
    } else {
      velocityBase = 26000 - (baseProgress - 0.8) * 60000;
      if (velocityBase < 2000) velocityBase = 2000;
    }

    // fuel drains more during burns (start + near LOI)
    let fuelDrop;
    if (baseProgress < 0.1) {
      fuelDrop = baseProgress * 30;
    } else if (baseProgress < 0.8) {
      fuelDrop = 30 + (baseProgress - 0.1) * 10;
    } else {
      fuelDrop = 40 + (baseProgress - 0.8) * 40;
    }
    let newFuel = clamp(82 - fuelDrop, 5, 100);

    // emergency modes override some values
    if (emergencyMode === "landing") {
      // simulate descending towards a safe landing (distance to 0, speed dropping)
      const startDist = distanceFromEarth;
      distanceFromEarth = startDist * (1 - emergencyProgress);
      distanceFromMoon = Math.max(MOON_DISTANCE_KM - distanceFromEarth, 0);
      velocityBase = 26000 * (1 - emergencyProgress) + 2000;
    } else if (emergencyMode === "abort") {
      // freeze distance, lower speed a bit to represent safe orbit
      velocityBase = Math.max(12000, velocityBase * 0.6);
    }

    // thruster boost (positive = accelerate, negative = retro-burn)
    let velocity = velocityBase + thrusterBoost;
    newFuel = clamp(newFuel - Math.abs(thrusterBoost) / 2000, 0, 100);

    const newMetrics = {
      fuel: newFuel,
      power: clamp(93 - baseProgress * 8, 70, 100),
      orbit: clamp(60 + baseProgress * 40, 0, 100),
      cabin: 100,
      comms: clamp(88 - Math.abs(baseProgress - 0.5) * 20, 60, 100),
    };

    const insideTemp = 22.5;
    const outsideTemp =
      baseProgress < 0.5 ? -160 - baseProgress * 40 : -200 + (baseProgress - 0.5) * 20;
    const o2 = 98.2 - baseProgress * 1.5;
    const co2 = 0.04 + baseProgress * 0.03;

    const phase = getPhaseForProgress(baseProgress);

    setTelemetry((prev) => ({
      ...prev,
      velocity,
      insideTemp,
      outsideTemp,
      o2,
      co2,
      distanceFromEarth,
      distanceFromMoon,
      trajectoryPhase:
        emergencyMode === "landing"
          ? "EMERGENCY LANDING SEQUENCE"
          : emergencyMode === "abort"
          ? "ABORT TRAJECTORY – SAFE ORBIT"
          : phase.label,
    }));

    setMetrics((prev) => ({
      ...prev,
      ...newMetrics,
    }));

    setCurrentPhaseId((prevId) => (prevId === phase.id ? prevId : phase.id));

    // special events / micro incidents
    SPECIAL_EVENTS.forEach((ev) => {
      if (
        baseProgress >= ev.triggerProgress &&
        !firedEventsRef.current.has(ev.id)
      ) {
        firedEventsRef.current.add(ev.id);
        const stamp = new Date().toLocaleTimeString();
        setAchievements((prev) => [
          ...prev,
          { id: ev.id, label: ev.label, time: stamp },
        ]);
        const line = ev.label;
        setHistory((prev) => [
          ...prev,
          { sender: "COPILOT", text: line, time: stamp },
        ]);
        speakText(line);
      }
    });

    if (baseProgress >= 1 && emergencyMode === "none") {
      missionRunningRef.current = false;
      setStatus("MISSION COMPLETE");
    }
  }, [missionTimeSec, emergencyMode, emergencyProgress, thrusterBoost]);

  // auto voice announcement when phase changes + ETA line
  useEffect(() => {
    const phase = MISSION_PHASES.find((p) => p.id === currentPhaseId);
    if (!phase) return;

    if (lastAnnouncedPhaseRef.current === phase.id) return;
    lastAnnouncedPhaseRef.current = phase.id;

    const progress = clamp(missionTimeSec / MISSION_DURATION_SEC, 0, 1);
    const idx = MISSION_PHASES.findIndex((p) => p.id === phase.id);
    const next = MISSION_PHASES[idx + 1];
    let etaMissionSec = 0;
    if (next) {
      const remainingProgress = Math.max(next.startProgress - progress, 0);
      etaMissionSec = remainingProgress * MISSION_DURATION_SEC;
    }

    const etaText = next
      ? `Estimated time to next phase ${next.label}: ${formatEta(
          etaMissionSec
        )} of mission time.`
      : "We are in the final planned phase of the mission.";

    const line = `${phase.label}. ${phase.onEnter} ${etaText}`;

    const stamp = new Date().toLocaleTimeString();

    setAssistantText(line);
    setHistory((prev) => [
      ...prev,
      { sender: "COPILOT", text: line, time: stamp },
    ]);

    setAchievements((prev) => [
      ...prev,
      { id: `phase-${phase.id}`, label: `Phase reached: ${phase.label}`, time: stamp },
    ]);

    playChime();
    speakText(line);
  }, [currentPhaseId]);

  // ------------------------------------------------------------
  // UI ACTION HANDLERS
  // ------------------------------------------------------------
  function handleStartListening() {
    try {
      recognitionRef.current?.start();
    } catch (err) {
      console.error(err);
      setError("Mic could not start.");
    }
  }

  function handleStopListening() {
    recognitionRef.current?.stop();
  }

  function handleSendText() {
    if (!userText.trim()) return;
    const cleaned = preprocessCommand(userText);

    setHistory((prev) => [
      ...prev,
      { sender: "YOU", text: cleaned, time: new Date().toLocaleTimeString() },
    ]);

    sendToBackend(cleaned);
  }

  function handleStopSpeaking() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }

  function handleTimePreset(scale) {
    setTimeScale(scale);
    setCustomScaleInput(String(scale));
  }

  function handleCustomTimeApply() {
    const parsed = parseFloat(customScaleInput);
    if (isNaN(parsed) || parsed <= 0) return;
    const safe = clamp(parsed, 0.25, 200);
    setTimeScale(safe);
  }

  function triggerEmergency(mode) {
    if (mode === "none") {
      setEmergencyMode("none");
      setStatus("EMERGENCY CLEARED – RETURNING TO NOMINAL TRAJECTORY");
      speakText("Emergency cleared. Returning to nominal mission trajectory.");
      return;
    }

    if (mode === "abort") {
      setEmergencyMode("abort");
      setStatus("ABORT SEQUENCE – HOLDING SAFE ORBIT");
      const line =
        "Abort command received. Executing emergency safe-orbit procedure and cancelling further phase progression.";
      speakText(line);
      setHistory((prev) => [
        ...prev,
        { sender: "COPILOT", text: line, time: new Date().toLocaleTimeString() },
      ]);
    } else if (mode === "landing") {
      setEmergencyMode("landing");
      setStatus("EMERGENCY LANDING SEQUENCE ACTIVE");
      const line =
        "Emergency landing initiated. Executing controlled descent burn to safest available trajectory.";
      speakText(line);
      setHistory((prev) => [
        ...prev,
        { sender: "COPILOT", text: line, time: new Date().toLocaleTimeString() },
      ]);
    }
  }

  function adjustThruster(delta) {
    setThrusterBoost((prev) => {
      const next = clamp(prev + delta, -5000, 5000);
      const direction = next > prev ? "forward" : "reverse";
      const line =
        direction === "forward"
          ? "Thruster burst applied. Increasing forward velocity."
          : "Retro thrusters fired. Reducing velocity.";
      speakText(line);
      setHistory((prevHist) => [
        ...prevHist,
        {
          sender: "COPILOT",
          text: line,
          time: new Date().toLocaleTimeString(),
        },
      ]);
      return next;
    });
  }

  function jumpToPhase(phaseId) {
    const phase = MISSION_PHASES.find((p) => p.id === phaseId);
    if (!phase) return;
    const t = phase.startProgress * MISSION_DURATION_SEC;
    setMissionTimeSec(t);
    setEmergencyMode("none");
    setStatus(`MANUAL JUMP TO PHASE: ${phase.label}`);
    speakText(`Manual phase jump executed. We are now at ${phase.label}.`);
  }

  const coreStateClass =
    view !== "dashboard"
      ? "core-idle"
      : isListening
      ? "core-listening"
      : isSpeaking
      ? "core-speaking"
      : isLoading
      ? "core-processing"
      : "core-idle";

  const missionProgressPercent = clamp(
    (missionTimeSec / MISSION_DURATION_SEC) * 100,
    0,
    100
  );
  const currentPhase =
    MISSION_PHASES.find((p) => p.id === currentPhaseId) || MISSION_PHASES[0];

  const progress = clamp(missionTimeSec / MISSION_DURATION_SEC, 0, 1);
  const earthInfluence = clamp(1 - progress, 0, 1);
  const moonInfluence = clamp(progress, 0, 1);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="hud-root">
      <div className="hud-overlay" />

      {/* TOP BAR */}
      <header className="hud-topbar">
        <div className="hud-logo">
          <span className="hud-logo-main">MISSION COPILOT</span>
          <span className="hud-logo-sub">LUNAR OPS INTERFACE</span>
        </div>

        <div className="hud-top-status">
          <StatusPill label="AI CORE" state={backendOnline ? "online" : "offline"} />
          <StatusPill label="VOICE IN" state={speechReady ? "online" : "offline"} />
          <StatusPill label="VOICE OUT" state={ttsReady ? "online" : "offline"} />
        </div>

        <div className="hud-top-right">
          <div className="hud-top-clock">
            <span>{new Date().toLocaleDateString()}</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>

          <button
            className="hud-nav-btn"
            onClick={() =>
              setView(view === "dashboard" ? "telemetry" : "dashboard")
            }
          >
            {view === "dashboard" ? "Open Crew Telemetry" : "Back to HUD"}
          </button>
        </div>
      </header>

      {/* MAIN GRID (scrollable) */}
      {view === "dashboard" ? (
        <main
          className="hud-main"
          style={{ overflowY: "auto", maxHeight: "calc(100vh - 96px)" }}
        >
          {/* LEFT PANEL */}
          <section className="hud-panel hud-panel-left">
            {/* USER COMMAND */}
            <div className="hud-card hud-card-compact">
              <div className="hud-card-header">USER COMMAND</div>
              <div className="hud-card-body">
                <textarea
                  className="hud-textarea"
                  value={userText}
                  onChange={(e) => setUserText(e.target.value)}
                  placeholder="Speak using mic or type a command…"
                />
              </div>
            </div>

            {/* COPILOT RESPONSE */}
            <div className="hud-card hud-card-primary">
              <div className="hud-card-header">
                COPILOT RESPONSE {isLoading && <span className="hud-pulse-dot" />}
              </div>
              <div className="hud-card-body hud-response-body">
                {assistantText || (
                  <span className="hud-placeholder">Awaiting response…</span>
                )}
              </div>
            </div>

            {/* COMMS LOG */}
            <div className="hud-card hud-card-compact hud-history">
              <div className="hud-card-header">COMMS LOG</div>
              <div className="hud-card-body hud-history-body">
                {history.length === 0 ? (
                  <span className="hud-placeholder">No transmissions yet.</span>
                ) : (
                  history
                    .slice()
                    .reverse()
                    .map((msg, idx) => (
                      <div
                        key={idx}
                        className={`hud-msg hud-msg-${msg.sender.toLowerCase()}`}
                      >
                        <div className="hud-msg-meta">
                          <span className="hud-msg-tag">{msg.sender}</span>
                          <span className="hud-msg-time">{msg.time}</span>
                        </div>
                        <div className="hud-msg-text">{msg.text}</div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* CONTROLS */}
            <div className="hud-controls-row">
              <button
                className={`hud-btn ${isListening ? "hud-btn-active" : ""}`}
                onClick={handleStartListening}
                disabled={!speechReady || isListening}
              >
                🎙 Start Mic
              </button>

              <button
                className="hud-btn hud-btn-danger"
                onClick={handleStopListening}
                disabled={!isListening}
              >
                ⏹ Stop Mic
              </button>

              <button
                className="hud-btn hud-btn-accent"
                onClick={handleSendText}
                disabled={!userText.trim()}
              >
                📤 Send
              </button>

              <button
                className="hud-btn hud-btn-warning"
                onClick={handleStopSpeaking}
                disabled={!isSpeaking}
              >
                🔇 Stop Voice
              </button>
            </div>
          </section>

          {/* CENTER HUD CORE */}
          <section className="hud-core">
            <div className={`hud-core-circle ${coreStateClass}`}>
              <div className="hud-core-ring hud-core-ring-outer" />
              <div className="hud-core-ring hud-core-ring-middle" />
              <div className="hud-core-ring hud-core-ring-inner" />

              <button
                className="hud-core-mic"
                onClick={isListening ? handleStopListening : handleStartListening}
              >
                <span className="hud-core-mic-icon">🎙</span>
                <span className="hud-core-mic-label">
                  {isListening
                    ? "LISTENING"
                    : isSpeaking
                    ? "SPEAKING"
                    : "TAP TO ACTIVATE"}
                </span>
              </button>

              <div className="hud-core-readout">{status}</div>
            </div>
          </section>

          {/* RIGHT PANEL */}
          <section className="hud-panel hud-panel-right">
            {/* SYSTEM STATUS */}
            <div className="hud-card hud-card-compact">
              <div className="hud-card-header">SYSTEM STATUS</div>
              <div className="hud-card-body hud-system-grid">
                <SystemItem label="AI CORE LINK" ok={backendOnline} />
                <SystemItem label="VOICE INPUT" ok={speechReady} />
                <SystemItem label="VOICE OUTPUT" ok={ttsReady} />
                <SystemItem label="SESSION STABILITY" ok={true} />
              </div>
            </div>

            {/* MISSION METRICS */}
            <div
              className="hud-card hud-card-compact hud-clickable"
              onClick={() => setView("telemetry")}
            >
              <div className="hud-card-header">
                MISSION METRICS – TAP FOR DETAILS
              </div>
              <div className="hud-card-body hud-metrics-body">
                <MetricBar label="Fuel Reserves" value={metrics.fuel} />
                <MetricBar label="Power Grid" value={metrics.power} />
                <MetricBar label="Orbital Stability" value={metrics.orbit} />
                <MetricBar label="Cabin Integrity" value={metrics.cabin} />
                <MetricBar label="Comms Quality" value={metrics.comms} />
              </div>
            </div>

            {/* MISSION SIM CARD */}
            <div
              className="hud-card hud-card-compact hud-clickable"
              onClick={() => setView("mission")}
            >
              <div className="hud-card-header">MISSION SIMULATION – TAP FOR CONTROL</div>
              <div className="hud-card-body hud-mission-summary-body">
                <div className="hud-mission-summary-row">
                  <span>Progress</span>
                  <span>{missionProgressPercent.toFixed(1)}%</span>
                </div>
                <div className="hud-mission-summary-bar">
                  <div
                    className="hud-mission-summary-fill"
                    style={{ width: `${missionProgressPercent}%` }}
                  />
                </div>
                <div className="hud-mission-summary-row">
                  <span>Current Phase</span>
                  <span>{currentPhase.label}</span>
                </div>
                <div className="hud-mission-summary-row">
                  <span>Warp Scale</span>
                  <span>{timeScale.toFixed(2)}×</span>
                </div>
              </div>
            </div>

            {/* MISSION CONTEXT */}
            <div className="hud-card hud-card-compact">
              <div className="hud-card-header">MISSION CONTEXT</div>
              <div className="hud-card-body hud-mission-body">
                <p>
                  Mission Copilot optimized for{" "}
                  <strong>Lunar Tourism Operations</strong>.
                </p>
                <p>
                  Hybrid Apollo-style trajectory with autonomous phase
                  announcements and emergency control modes.
                </p>
              </div>
            </div>

            {/* DIAGNOSTICS */}
            <div className="hud-card hud-card-compact hud-error-card">
              <div className="hud-card-header">DIAGNOSTICS</div>
              <div className="hud-card-body hud-diagnostics-body">
                <div className="hud-diagnostics-line">
                  <span className="hud-diagnostics-label">STATUS:</span>
                  <span className="hud-diagnostics-value">{status}</span>
                </div>

                {error ? (
                  <div className="hud-diagnostics-line hud-diagnostics-error">
                    <span className="hud-diagnostics-label">ERROR:</span>
                    <span className="hud-diagnostics-value">{error}</span>
                  </div>
                ) : (
                  <span>No critical faults.</span>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : view === "telemetry" ? (
        // ---------------------------------------------
        // TELEMETRY PAGE
        // ---------------------------------------------
        <main
          className="hud-main telemetry-main"
          style={{ overflowY: "auto", maxHeight: "calc(100vh - 96px)" }}
        >
          {/* LEFT SIDE */}
          <section className="hud-panel telemetry-left">
            {/* VELOCITY PANEL */}
            <div className="hud-card hud-card-primary telemetry-velocity-card">
              <div className="hud-card-header">VELOCITY VECTOR</div>
              <div className="hud-card-body telemetry-velocity-body">
                <div className="velocity-gauge">
                  <div className="velocity-circle">
                    <div className="velocity-ring velocity-ring-outer" />
                    <div className="velocity-ring velocity-ring-inner" />

                    <div className="velocity-core">
                      <div className="velocity-label">km/h</div>
                      <div className="velocity-value">
                        {Math.round(telemetry.velocity).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="velocity-readouts">
                    <div className="velocity-row">
                      <span>Orbital Speed</span>
                      <span>{Math.round(telemetry.velocity)} km/h</span>
                    </div>

                    <div className="velocity-row">
                      <span>Inside Temp</span>
                      <span>{telemetry.insideTemp.toFixed(1)} °C</span>
                    </div>

                    <div className="velocity-row">
                      <span>Outside Temp</span>
                      <span>{telemetry.outsideTemp.toFixed(0)} °C</span>
                    </div>

                    <div className="velocity-row">
                      <span>O₂ Level</span>
                      <span>{telemetry.o2.toFixed(1)} %</span>
                    </div>

                    <div className="velocity-row">
                      <span>CO₂ Level</span>
                      <span>{telemetry.co2.toFixed(3)} %</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* DISTANCE / TRAJECTORY */}
            <div className="hud-card hud-card-compact telemetry-distance-card">
              <div className="hud-card-header">TRAJECTORY / DISTANCE</div>
              <div className="hud-card-body telemetry-distance-body">
                <div className="distance-box">
                  <div className="distance-label">DISTANCE FROM EARTH</div>
                  <div className="distance-value">
                    {Math.round(telemetry.distanceFromEarth).toLocaleString()} km
                  </div>
                </div>

                <div className="distance-box">
                  <div className="distance-label">DISTANCE TO MOON</div>
                  <div className="distance-value">
                    {Math.round(telemetry.distanceFromMoon).toLocaleString()} km
                  </div>
                </div>

                <div className="distance-box">
                  <div className="distance-label">SPACECRAFT SPEED</div>
                  <div className="distance-value">
                    {Math.round(telemetry.velocity).toLocaleString()} km/h
                  </div>
                </div>

                <div className="distance-box distance-box-wide">
                  <div className="distance-label">TRAJECTORY PHASE</div>
                  <div className="distance-phase">
                    {telemetry.trajectoryPhase}
                  </div>

                  <div className="distance-progress-bar">
                    <div
                      className="distance-progress-fill"
                      style={{
                        width: `${clamp(
                          ((telemetry.distanceFromEarth - 200) /
                            (MOON_DISTANCE_KM - 200)) *
                            100,
                          0,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT SIDE */}
          <section className="hud-panel telemetry-right">
            {/* CREW VITALS */}
            <div className="hud-card hud-card-compact">
              <div className="hud-card-header">CREW VITALS – PULSE & BP</div>
              <div className="hud-card-body telemetry-crew-body">
                {crewVitals.map((c) => (
                  <div key={c.name} className="crew-row">
                    <div className="crew-main">
                      <div className="crew-name">{c.name}</div>
                      <div className="crew-role">{c.role}</div>
                      <div className="crew-bp-text">
                        BP: {Math.round(c.bpSys)}/{Math.round(c.bpDia)}
                      </div>
                    </div>

                    <div className="crew-pulse">
                      <div className="crew-pulse-value">
                        {Math.round(c.pulse)} bpm
                      </div>
                      <div className="crew-pulse-bar">
                        <div
                          className="crew-pulse-fill"
                          style={{
                            width: `${clamp(((c.pulse - 50) / 60) * 100, 0, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* HOLOGRAM */}
            <div className="hud-card hud-card-compact telemetry-holo-card">
              <div className="hud-card-header">CREW HOLOGRAM GRID</div>
              <div className="hud-card-body crew-holo-grid">
                {crewVitals.map((c) => (
                  <div key={c.name} className="crew-holo-card">
                    <div className="crew-holo-silhouette">
                      <div className="crew-holo-body" />
                    </div>

                    <div className="crew-holo-meta">
                      <div className="crew-holo-name">{c.name}</div>
                      <div className="crew-holo-role">{c.role}</div>
                      <div className="crew-holo-pulse">
                        {Math.round(c.pulse)} bpm
                      </div>
                      <div className="crew-holo-bp">
                        {Math.round(c.bpSys)}/{Math.round(c.bpDia)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CREW MANIFEST */}
            <div className="hud-card hud-card-compact telemetry-legend-card">
              <div className="hud-card-header">CREW MANIFEST</div>
              <div className="hud-card-body telemetry-legend-body">
                {CREW.map((c) => (
                  <div key={c.name} className="crew-legend-row">
                    <span className="crew-legend-name">{c.name}</span>
                    <span className="crew-legend-role">{c.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      ) : (
        // ---------------------------------------------
        // THIRD PAGE – MISSION CONTROL
        // ---------------------------------------------
        <main
          className="hud-main telemetry-main"
          style={{ overflowY: "auto", maxHeight: "calc(100vh - 96px)" }}
        >
          {/* LEFT SIDE: mission vector + warp + flight controls */}
          <section className="hud-panel telemetry-left">
            {/* MISSION VECTOR */}
            <div className="hud-card hud-card-primary telemetry-velocity-card">
              <div className="hud-card-header">MISSION VECTOR</div>
              <div className="hud-card-body telemetry-velocity-body">
                <div className="velocity-gauge">
                  <div className="velocity-circle">
                    <div className="velocity-ring velocity-ring-outer" />
                    <div className="velocity-ring velocity-ring-inner" />

                    <div className="velocity-core">
                      <div className="velocity-label">PROGRESS</div>
                      <div className="velocity-value">
                        {missionProgressPercent.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="velocity-readouts">
                    <div className="velocity-row">
                      <span>Mission Elapsed</span>
                      <span>
                        {formatMissionTime(missionTimeSec)} /{" "}
                        {formatMissionTime(MISSION_DURATION_SEC)}
                      </span>
                    </div>

                    <div className="velocity-row">
                      <span>Current Phase</span>
                      <span>{currentPhase.label}</span>
                    </div>

                    <div className="velocity-row">
                      <span>Trajectory Phase</span>
                      <span>{telemetry.trajectoryPhase}</span>
                    </div>

                    <div className="velocity-row">
                      <span>Warp Scale</span>
                      <span>{timeScale.toFixed(2)}×</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* WARP DRIVE CONTROL */}
            <div className="hud-card hud-card-compact">
              <div className="hud-card-header">WARP DRIVE CONTROL</div>
              <div className="hud-card-body">
                <div className="hud-controls-row">
                  <button
                    className={`hud-btn hud-btn-ghost ${
                      timeScale === 1 ? "hud-btn-active" : ""
                    }`}
                    onClick={() => handleTimePreset(1)}
                  >
                    REALTIME 1×
                  </button>
                  <button
                    className={`hud-btn hud-btn-ghost ${
                      timeScale === 10 ? "hud-btn-active" : ""
                    }`}
                    onClick={() => handleTimePreset(10)}
                  >
                    CRUISE 10×
                  </button>
                  <button
                    className={`hud-btn hud-btn-ghost ${
                      timeScale === 100 ? "hud-btn-active" : ""
                    }`}
                    onClick={() => handleTimePreset(100)}
                  >
                    WARP 100×
                  </button>
                </div>

                <div className="hud-metric" style={{ marginTop: "1rem" }}>
                  <div className="hud-metric-top">
                    <span className="hud-metric-label">Custom Warp</span>
                    <span className="hud-metric-value">
                      {timeScale.toFixed(2)}×
                    </span>
                  </div>
                  <div className="hud-metric-bar hud-metric-bar-mid">
                    <div
                      className="hud-metric-fill"
                      style={{
                        width: `${clamp((timeScale / 200) * 100, 0, 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="hud-controls-row" style={{ marginTop: "0.8rem" }}>
                  <span>Manual:</span>
                  <input
  className="hud-time-input"
  type="number"
  min="0.25"
  max="200"
  step="0.25"
  value={customScaleInput}
  onChange={(e) => {
    const v = e.target.value;
    setCustomScaleInput(v);

    const parsed = parseFloat(v);
    if (!isNaN(parsed) && parsed > 0) {
      const safe = clamp(parsed, 0.25, 200);
      setTimeScale(safe);
    }
  }}
/>

                </div>
              </div>
            </div>

            {/* FLIGHT CONTROLS: EMERGENCY + THRUSTERS + PHASE JUMP */}
            <div className="hud-card hud-card-compact">
              <div className="hud-card-header">FLIGHT CONTROLS</div>
              <div className="hud-card-body">
                <div className="hud-controls-row">
                  <button
                    className="hud-btn hud-btn-danger"
                    onClick={() => triggerEmergency("abort")}
                  >
                    🚨 Abort to Safe Orbit
                  </button>
                  <button
                    className="hud-btn hud-btn-warning"
                    onClick={() => triggerEmergency("landing")}
                  >
                    🛬 Emergency Landing
                  </button>
                </div>
                <div className="hud-controls-row" style={{ marginTop: "0.6rem" }}>
                  <button
                    className="hud-btn hud-btn-ghost"
                    onClick={() => triggerEmergency("none")}
                  >
                    ✅ Clear Emergency
                  </button>
                </div>

                <hr className="hud-divider" />

                <div className="hud-controls-row">
                  <span>Thrusters:</span>
                  <button
                    className="hud-btn hud-btn-ghost"
                    onClick={() => adjustThruster(-500)}
                  >
                    🔻 Retro Burn
                  </button>
                  <button
                    className="hud-btn hud-btn-ghost"
                    onClick={() => adjustThruster(500)}
                  >
                    🔺 Forward Burst
                  </button>
                </div>
                <div className="hud-metric" style={{ marginTop: "0.5rem" }}>
                  <div className="hud-metric-top">
                    <span className="hud-metric-label">Thruster Offset</span>
                    <span className="hud-metric-value">
                      {Math.round(thrusterBoost)} km/h
                    </span>
                  </div>
                  <div className="hud-metric-bar hud-metric-bar-mid">
                    <div
                      className="hud-metric-fill"
                      style={{
                        width: `${clamp(
                          (Math.abs(thrusterBoost) / 5000) * 100,
                          0,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <hr className="hud-divider" />

                <div className="hud-controls-row">
                  <span>Jump to Phase:</span>
                  <select
                    className="hud-select"
                    onChange={(e) => jumpToPhase(e.target.value)}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select phase…
                    </option>
                    {MISSION_PHASES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT SIDE: trajectory, env, achievements */}
          <section className="hud-panel telemetry-right">
            {/* TRAJECTORY / GRAVITY */}
            <div className="hud-card hud-card-compact telemetry-distance-card">
              <div className="hud-card-header">TRAJECTORY / GRAVITY WELL</div>
              <div className="hud-card-body telemetry-distance-body">
                <div className="distance-box">
                  <div className="distance-label">DISTANCE FROM EARTH</div>
                  <div className="distance-value">
                    {Math.round(telemetry.distanceFromEarth).toLocaleString()} km
                  </div>
                </div>

                <div className="distance-box">
                  <div className="distance-label">DISTANCE TO MOON</div>
                  <div className="distance-value">
                    {Math.round(telemetry.distanceFromMoon).toLocaleString()} km
                  </div>
                </div>

                <div className="distance-box">
                  <div className="distance-label">SPACECRAFT SPEED</div>
                  <div className="distance-value">
                    {Math.round(telemetry.velocity).toLocaleString()} km/h
                  </div>
                </div>

                <div className="distance-box distance-box-wide">
                  <div className="distance-label">EARTH / MOON INFLUENCE</div>
                  <div className="distance-phase">
                    Earth {(earthInfluence * 100).toFixed(1)}% • Moon{" "}
                    {(moonInfluence * 100).toFixed(1)}%
                  </div>
                  <div className="distance-progress-bar">
                    <div
                      className="distance-progress-fill"
                      style={{ width: `${earthInfluence * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ENVIRONMENT */}
            <div className="hud-card hud-card-compact">
              <div className="hud-card-header">ENVIRONMENT & LIFE SUPPORT</div>
              <div className="hud-card-body telemetry-distance-body">
                <div className="distance-box">
                  <div className="distance-label">CABIN TEMPERATURE</div>
                  <div className="distance-value">
                    {telemetry.insideTemp.toFixed(1)} °C
                  </div>
                </div>

                <div className="distance-box">
                  <div className="distance-label">OUTSIDE TEMPERATURE</div>
                  <div className="distance-value">
                    {telemetry.outsideTemp.toFixed(0)} °C
                  </div>
                </div>

                <div className="distance-box">
                  <div className="distance-label">O₂ LEVEL</div>
                  <div className="distance-value">
                    {telemetry.o2.toFixed(1)} %
                  </div>
                </div>

                <div className="distance-box">
                  <div className="distance-label">CO₂ LEVEL</div>
                  <div className="distance-value">
                    {telemetry.co2.toFixed(3)} %
                  </div>
                </div>
              </div>
            </div>

            {/* PHASE TIMELINE */}
            <div className="hud-card hud-card-compact telemetry-legend-card">
              <div className="hud-card-header">PHASE TIMELINE</div>
              <div className="hud-card-body telemetry-legend-body">
                {MISSION_PHASES.map((p) => {
                  const reached = progress >= p.startProgress;
                  const isCurrent = currentPhase.id === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`crew-legend-row ${
                        reached ? "mission-phase-reached" : ""
                      } ${isCurrent ? "mission-phase-current" : ""}`}
                    >
                      <span className="crew-legend-name">{p.label}</span>
                      <span className="crew-legend-role">
                        T+ {Math.round(p.startProgress * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACHIEVEMENTS / EVENTS */}
            <div className="hud-card hud-card-compact telemetry-legend-card">
              <div className="hud-card-header">MISSION ACHIEVEMENTS & EVENTS</div>
              <div className="hud-card-body telemetry-legend-body">
                {achievements.length === 0 ? (
                  <span className="hud-placeholder">
                    No logged achievements yet.
                  </span>
                ) : (
                  achievements
                    .slice()
                    .reverse()
                    .map((a, idx) => (
                      <div key={idx} className="crew-legend-row">
                        <span className="crew-legend-name">{a.label}</span>
                        <span className="crew-legend-role">{a.time}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* FOOTER */}
      <footer className="hud-bottombar">
        <span>{status}</span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------
// STATUS PILL COMPONENT
// ------------------------------------------------------------
function StatusPill({ label, state }) {
  return (
    <div className={`hud-pill hud-pill-${state}`}>
      <span className="hud-pill-dot"></span>
      <span className="hud-pill-label">{label}</span>
      <span className="hud-pill-state">
        {state === "online" ? "ONLINE" : "OFFLINE"}
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// SYSTEM ITEM COMPONENT
// ------------------------------------------------------------
function SystemItem({ label, ok }) {
  return (
    <div className="hud-system-item">
      <span className="hud-system-dot hud-system-dot-bg" />
      <span className={`hud-system-dot hud-system-dot-fg ${ok ? "ok" : "bad"}`} />
      <span className="hud-system-label">{label}</span>
      <span className={`hud-system-status ${ok ? "ok" : "bad"}`}>
        {ok ? "STABLE" : "FAULT"}
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// METRIC BAR COMPONENT
// ------------------------------------------------------------
function MetricBar({ label, value }) {
  let safe = Math.round(clamp(value, 0, 100));
  let band = safe >= 85 ? "high" : safe <= 60 ? "low" : "mid";

  return (
    <div className="hud-metric">
      <div className="hud-metric-top">
        <span className="hud-metric-label">{label}</span>
        <span className="hud-metric-value">{safe}%</span>
      </div>

      <div className={`hud-metric-bar hud-metric-bar-${band}`}>
        <div className="hud-metric-fill" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

export default App;
