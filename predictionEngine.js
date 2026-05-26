// predictionEngine.js

// Helper: clamp a value between min and max
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ------------ 1. TRAJECTORY DRIFT MODEL ------------
function predictTrajectoryDrift(telemetry) {
  const {
    velocity_kms = 10.8,     // km/s
    fuel_remaining_pct = 80, // %
    distance_to_target_km = 200000, // km
    attitude_error_deg = 0.5 // degrees off nominal
  } = telemetry;

  // Simple heuristic model
  const baseDrift = (attitude_error_deg / 0.5) * 5; // km drift per hour
  const fuelFactor = fuel_remaining_pct < 30 ? 1.8 : fuel_remaining_pct < 50 ? 1.3 : 1.0;
  const velocityFactor = velocity_kms > 11 ? 1.2 : 1.0;

  const predictedDrift1h_km = baseDrift * fuelFactor * velocityFactor;
  const predictedDrift3h_km = predictedDrift1h_km * 3;
  const predictedDrift6h_km = predictedDrift1h_km * 6;

  const correctionDeltaV_ms = predictedDrift3h_km * 0.05; // fake scaling
  const driftPercentOfPath = (predictedDrift3h_km / distance_to_target_km) * 100;

  let riskLevel = "LOW";
  if (driftPercentOfPath > 1 && driftPercentOfPath <= 3) riskLevel = "MEDIUM";
  if (driftPercentOfPath > 3) riskLevel = "HIGH";

  return {
    predictedDrift1h_km,
    predictedDrift3h_km,
    predictedDrift6h_km,
    correctionDeltaV_ms,
    driftPercentOfPath,
    riskLevel
  };
}

// ------------ 2. STRUCTURAL INTEGRITY / LEAK MODEL ------------
function predictStructuralIntegrity(telemetry) {
  const {
    cabin_pressure_kpa = 101,    // normal ~101 kPa
    cabin_pressure_trend = -0.02, // kPa per minute (negative = dropping)
    hull_temp_c = 25,           // °C
    vibration_level = 0.3       // 0–1 normalized
  } = telemetry;

  const pressureDeviation = Math.abs(101 - cabin_pressure_kpa); // kPa
  const leakRateFactor = cabin_pressure_trend < 0 ? Math.abs(cabin_pressure_trend) : 0;
  const thermalStressFactor = Math.max(0, (hull_temp_c - 40) / 40); // >40C increases stress
  const vibrationFactor = vibration_level;

  // Combined risk score 0–1
  let leakRiskScore = 0;
  leakRiskScore += pressureDeviation / 50; // pressure difference weight
  leakRiskScore += leakRateFactor / 2;     // leak trend weight
  leakRiskScore += thermalStressFactor * 0.7;
  leakRiskScore += vibrationFactor * 0.5;

  leakRiskScore = clamp(leakRiskScore, 0, 1);

  let riskLevel = "LOW";
  if (leakRiskScore > 0.35 && leakRiskScore <= 0.7) riskLevel = "MEDIUM";
  if (leakRiskScore > 0.7) riskLevel = "HIGH";

  // Time to critical: how long until pressure reaches 70 kPa at current trend
  let timeToCritical_min = null;
  if (cabin_pressure_trend < 0) {
    const deltaToCritical = cabin_pressure_kpa - 70;
    timeToCritical_min = deltaToCritical > 0 ? deltaToCritical / Math.abs(cabin_pressure_trend) : 0;
  }

  return {
    leakRiskScore,
    riskLevel,
    timeToCritical_min,
    cabin_pressure_kpa,
    cabin_pressure_trend,
    hull_temp_c,
    vibration_level
  };
}

// ------------ 3. RADIATION SPIKE WARNING MODEL ------------
function predictRadiation(telemetry) {
  const {
    radiation_uSv_h = 50,   // microsieverts per hour
    solar_wind_index = 2,   // 0–10
    altitude_km = 300,      // LEO ~400km
    shielding_factor = 0.7  // 0–1, higher = better shielding
  } = telemetry;

  const baseRisk = radiation_uSv_h / 200; // >200 µSv/h is serious
  const solarFactor = solar_wind_index / 10;
  const altitudeFactor = altitude_km > 300 ? (altitude_km - 300) / 500 : 0; // higher = more exposed
  const shieldingImpact = (1 - shielding_factor) * 0.8;

  let spikeRiskScore = baseRisk + solarFactor + altitudeFactor + shieldingImpact;
  spikeRiskScore = clamp(spikeRiskScore, 0, 1);

  let riskLevel = "LOW";
  if (spikeRiskScore > 0.35 && spikeRiskScore <= 0.7) riskLevel = "MEDIUM";
  if (spikeRiskScore > 0.7) riskLevel = "HIGH";

  // Approx safe exposure time at current level
  // Very rough: 1000 µSv as "soft" daily limit here (just for sim)
  const safeDose_uSv = 1000;
  const safeExposure_h = radiation_uSv_h > 0 ? safeDose_uSv / radiation_uSv_h : null;

  return {
    radiation_uSv_h,
    solar_wind_index,
    altitude_km,
    shielding_factor,
    spikeRiskScore,
    riskLevel,
    safeExposure_h
  };
}

// ------------ 4. MISSION EVENT PREDICTION ENGINE ------------
function predictMissionEvents(telemetry) {
  const {
    mission_elapsed_sec = 0,
    mission_total_sec = 48 * 60 * 60, // 2 days
    phase = "launch", // "launch", "orbital", "trans_lunar", "lunar_orbit", "landing", "return"
    velocity_kms = 10.8,
    distance_to_target_km = 300000
  } = telemetry;

  const progress = clamp(mission_elapsed_sec / mission_total_sec, 0, 1);

  const events = [];

  // Example key events
  events.push({
    id: "TLI",
    name: "Trans-Lunar Injection Burn",
    expectedAt_pct: 0.15,
    predictedTime_sec: mission_total_sec * 0.15,
    status: progress >= 0.15 ? "COMPLETED" : "UPCOMING",
    riskHint: velocity_kms < 10 ? "Burn may need extension due to low velocity." : "Nominal burn duration."
  });

  events.push({
    id: "MIDCOURSE_CORR",
    name: "Mid-Course Correction Maneuver",
    expectedAt_pct: 0.40,
    predictedTime_sec: mission_total_sec * 0.40,
    status: progress >= 0.40 ? "COMPLETED" : "UPCOMING",
    riskHint:
      distance_to_target_km < 150000
        ? "Fine-tuning trajectory. Small delta-V expected."
        : "Larger correction anticipated due to higher distance."
  });

  events.push({
    id: "LOI",
    name: "Lunar Orbit Insertion Burn",
    expectedAt_pct: 0.60,
    predictedTime_sec: mission_total_sec * 0.60,
    status: progress >= 0.60 ? "COMPLETED" : "UPCOMING",
    riskHint:
      velocity_kms > 11
        ? "High capture burn required – monitor fuel closely."
        : "Nominal lunar orbit insertion expected."
  });

  events.push({
    id: "PDI",
    name: "Powered Descent Initiation",
    expectedAt_pct: 0.75,
    predictedTime_sec: mission_total_sec * 0.75,
    status: progress >= 0.75 ? "COMPLETED" : "UPCOMING",
    riskHint: "Landing radar and engines must be green."
  });

  events.push({
    id: "TEI",
    name: "Trans-Earth Injection",
    expectedAt_pct: 0.85,
    predictedTime_sec: mission_total_sec * 0.85,
    status: progress >= 0.85 ? "COMPLETED" : "UPCOMING",
    riskHint: "Ensure return trajectory window is open."
  });

  return {
    progress,
    currentPhase: phase,
    events
  };
}

// ------------ MAIN ENTRY POINT ------------
function computeAllPredictions(telemetry) {
  const trajectory = predictTrajectoryDrift(telemetry);
  const structural = predictStructuralIntegrity(telemetry);
  const radiation = predictRadiation(telemetry);
  const missionEvents = predictMissionEvents(telemetry);

  return {
    trajectory,
    structural,
    radiation,
    missionEvents
  };
}

export {
  computeAllPredictions,
  predictTrajectoryDrift,
  predictStructuralIntegrity,
  predictRadiation,
  predictMissionEvents
};
