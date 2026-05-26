// src/MissionPredictions.jsx
import React from "react";

function RiskBadge({ level }) {
  const colors = {
    LOW: "#16a34a",
    MEDIUM: "#facc15",
    HIGH: "#dc2626"
  };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: "#020617",
        border: `1px solid ${colors[level] || "#64748b"}`,
        color: colors[level] || "#e5e7eb"
      }}
    >
      {level || "N/A"}
    </span>
  );
}

export default function MissionPredictions({ predictions }) {
  if (!predictions) return null;

  const { trajectory, structural, radiation, missionEvents } = predictions;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: "16px",
        marginTop: "24px"
      }}
    >
      {/* Trajectory Drift */}
      <div
        style={{
          background: "linear-gradient(135deg, #020617, #020617)",
          borderRadius: "16px",
          padding: "16px",
          border: "1px solid #1e293b"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ color: "#e5e7eb", fontSize: "0.95rem" }}>Trajectory Drift</h3>
          <RiskBadge level={trajectory?.riskLevel} />
        </div>
        <p style={{ color: "#9ca3af", fontSize: "0.8rem", marginBottom: 8 }}>
          Predicted deviation from nominal trajectory.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.8rem", color: "#e5e7eb" }}>
          <li>Drift in 1h: {trajectory?.predictedDrift1h_km?.toFixed(2)} km</li>
          <li>Drift in 3h: {trajectory?.predictedDrift3h_km?.toFixed(2)} km</li>
          <li>Drift in 6h: {trajectory?.predictedDrift6h_km?.toFixed(2)} km</li>
          <li>
            ΔV correction (3h): {trajectory?.correctionDeltaV_ms?.toFixed(1)} m/s
          </li>
          <li>
            Path deviation: {trajectory?.driftPercentOfPath?.toFixed(3)}%
          </li>
        </ul>
      </div>

      {/* Structural Integrity / Leak */}
      <div
        style={{
          background: "linear-gradient(135deg, #020617, #020617)",
          borderRadius: "16px",
          padding: "16px",
          border: "1px solid #1e293b"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ color: "#e5e7eb", fontSize: "0.95rem" }}>Structural Integrity</h3>
          <RiskBadge level={structural?.riskLevel} />
        </div>
        <p style={{ color: "#9ca3af", fontSize: "0.8rem", marginBottom: 8 }}>
          Leak risk based on pressure, temperature, and vibration.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.8rem", color: "#e5e7eb" }}>
          <li>Cabin pressure: {structural?.cabin_pressure_kpa?.toFixed(1)} kPa</li>
          <li>
            Pressure trend: {structural?.cabin_pressure_trend?.toFixed(3)} kPa/min
          </li>
          <li>Hull temperature: {structural?.hull_temp_c?.toFixed(1)} °C</li>
          <li>
            Leak risk score: {(structural?.leakRiskScore * 100).toFixed(1)} %
          </li>
          <li>
            Time to critical (70 kPa):{" "}
            {structural?.timeToCritical_min != null
              ? `${structural.timeToCritical_min.toFixed(1)} min`
              : "Stable"}
          </li>
        </ul>
      </div>

      {/* Radiation Spike Warning */}
      <div
        style={{
          background: "linear-gradient(135deg, #020617, #020617)",
          borderRadius: "16px",
          padding: "16px",
          border: "1px solid #1e293b"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ color: "#e5e7eb", fontSize: "0.95rem" }}>Radiation Spike</h3>
          <RiskBadge level={radiation?.riskLevel} />
        </div>
        <p style={{ color: "#9ca3af", fontSize: "0.8rem", marginBottom: 8 }}>
          Forecast of radiation environment around the vehicle.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.8rem", color: "#e5e7eb" }}>
          <li>Radiation level: {radiation?.radiation_uSv_h?.toFixed(1)} µSv/h</li>
          <li>Solar wind index: {radiation?.solar_wind_index}</li>
          <li>Altitude: {radiation?.altitude_km} km</li>
          <li>
            Shielding: {(radiation?.shielding_factor * 100).toFixed(0)} %
          </li>
          <li>
            Safe exposure at current level:{" "}
            {radiation?.safeExposure_h != null
              ? `${radiation.safeExposure_h.toFixed(1)} h`
              : "N/A"}
          </li>
        </ul>
      </div>

      {/* Mission Event Prediction Engine */}
      <div
        style={{
          background: "linear-gradient(135deg, #020617, #020617)",
          borderRadius: "16px",
          padding: "16px",
          border: "1px solid #1e293b"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ color: "#e5e7eb", fontSize: "0.95rem" }}>Mission Events</h3>
          <span
            style={{
              fontSize: "0.75rem",
              color: "#9ca3af"
            }}
          >
            Phase: {missionEvents?.currentPhase}
          </span>
        </div>
        <p style={{ color: "#9ca3af", fontSize: "0.8rem", marginBottom: 8 }}>
          Predicted key burns and milestones on the mission timeline.
        </p>
        <div
          style={{
            marginBottom: 8,
            height: 6,
            borderRadius: 999,
            background: "#020617",
            overflow: "hidden",
            border: "1px solid #1f2933"
          }}
        >
          <div
            style={{
              width: `${(missionEvents?.progress || 0) * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #22c55e, #3b82f6)"
            }}
          ></div>
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            fontSize: "0.8rem",
            color: "#e5e7eb",
            maxHeight: 160,
            overflowY: "auto"
          }}
        >
          {(missionEvents?.events || []).map((ev) => {
            const pct = (ev.expectedAt_pct * 100).toFixed(0);
            const statusColor =
              ev.status === "COMPLETED"
                ? "#22c55e"
                : "#facc15";

            return (
              <li
                key={ev.id}
                style={{
                  padding: "4px 0",
                  borderBottom: "1px dashed #1f2937"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span>{ev.name}</span>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: statusColor
                    }}
                  >
                    {ev.status} · T+{(ev.predictedTime_sec / 3600).toFixed(1)} h
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "#9ca3af",
                    marginTop: 2
                  }}
                >
                  Timeline: {pct}% · {ev.riskHint}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
