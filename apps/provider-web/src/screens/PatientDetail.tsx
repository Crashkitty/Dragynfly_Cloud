import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  GLUCOSE_CONTEXT_LABELS,
  glucoseStatusLabel,
  type GlucoseReading,
  type PatientOverview,
} from "@dragonfly/shared";
import { api, TELEMED_BASE } from "../api.js";
import { GlucoseSparkline } from "../components/GlucoseSparkline.js";
import { BridgeTokensPanel } from "../components/BridgeTokensPanel.js";
import { bridgeEnabled } from "../features.js";

function fmt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function pillFor(status: GlucoseReading["status"]): string {
  if (status === "ok") return "pill pill-success";
  if (status === "warn") return "pill pill-warning";
  return "pill pill-error";
}

export function PatientDetail() {
  const { patientId } = useParams<{ patientId: string }>();
  const [overview, setOverview] = useState<PatientOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  async function load() {
    if (!patientId) return;
    try {
      setOverview(await api.overview(patientId));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, [patientId]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId || !newTaskTitle.trim()) return;
    await api.createTask(patientId, newTaskTitle.trim());
    setNewTaskTitle("");
    await load();
  }

  async function resolveTask(taskId: string) {
    await api.resolveTask(taskId);
    await load();
  }

  async function startTelemedFor(sessionId: string) {
    // Mint or reuse a stable roomId on the session, then open the
    // telemed Worker at that room. The patient app sees the same
    // session.roomId on refresh and can join the same room.
    try {
      const updated = await api.startTelemed(sessionId);
      if (!updated.roomId) {
        setError("Server did not return a roomId.");
        return;
      }
      window.open(`${TELEMED_BASE}/r/${updated.roomId}`, "_blank", "noopener");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  if (error) {
    return (
      <>
        <Link to="/">← Queue</Link>
        <div className="banner" style={{ background: "#fde2dd", color: "#7a1d10", marginTop: 16 }}>
          {error}
        </div>
      </>
    );
  }

  if (!overview) {
    return (
      <>
        <Link to="/">← Queue</Link>
        <div style={{ marginTop: 16, color: "var(--color-secondary)" }}>Loading…</div>
      </>
    );
  }

  const { patient, recentGlucose, recentMeals, upcomingTelemed, openTasks } = overview;
  const inRange = recentGlucose.filter((r) => r.status === "ok").length;
  const total = recentGlucose.length || 1;

  return (
    <>
      <div className="topbar">
        <div>
          <Link to="/">← Queue</Link>
          <h1 style={{ marginTop: 4 }}>
            {patient.firstName} {patient.lastName}
          </h1>
          <div className="meta">
            {patient.studyEnrollmentId} ·{" "}
            {patient.diabetesType ?? "diabetes type unknown"} · enrolled {fmt(patient.enrolledAt)}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">In-range readings</div>
          <div className="value">{Math.round((inRange / total) * 100)}%</div>
          <div className="delta">last {recentGlucose.length} readings</div>
        </div>
        <div className="kpi">
          <div className="label">Latest</div>
          <div className="value">
            {recentGlucose[0] ? `${recentGlucose[0].valueMgDl}` : "—"}
          </div>
          <div className="delta">
            {recentGlucose[0]
              ? `${GLUCOSE_CONTEXT_LABELS[recentGlucose[0].context]} · ${fmt(recentGlucose[0].timestamp)}`
              : "no data"}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Open tasks</div>
          <div className="value">{openTasks.length}</div>
          <div className="delta">{openTasks[0]?.title ?? "no tasks"}</div>
        </div>
        <div className="kpi">
          <div className="label">Telemed pending</div>
          <div className="value">{upcomingTelemed.length}</div>
          <div className="delta">requested or scheduled</div>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <div className="panel">
            <h2>Glucose trend</h2>
            <GlucoseSparkline readings={recentGlucose} />
            <h3>Recent readings</h3>
            <ul className="list-clean">
              {recentGlucose.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <span>
                    <strong>{r.valueMgDl}</strong> mg/dL · {GLUCOSE_CONTEXT_LABELS[r.context]}
                  </span>
                  <span>
                    <span className={pillFor(r.status)} style={{ marginRight: 8 }}>
                      {glucoseStatusLabel(r.status)}
                    </span>
                    <span style={{ color: "var(--color-secondary)" }}>{fmt(r.timestamp)}</span>
                  </span>
                </li>
              ))}
              {recentGlucose.length === 0 && <li>No readings logged.</li>}
            </ul>
          </div>

          <div className="panel">
            <h2>Recent meals</h2>
            <ul className="list-clean">
              {recentMeals.map((m) => (
                <li key={m.id}>
                  <span>{m.description}</span>
                  <span style={{ color: "var(--color-secondary)" }}>
                    {typeof m.carbsGrams === "number" ? `${m.carbsGrams} g · ` : ""}
                    {fmt(m.capturedAt)}
                  </span>
                </li>
              ))}
              {recentMeals.length === 0 && <li>No meals logged.</li>}
            </ul>
          </div>

        </div>

        <div>
          <div className="panel">
            <h2>Workflow tasks</h2>
            <form onSubmit={addTask} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Add a task…"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={!newTaskTitle.trim()}>
                Add
              </button>
            </form>
            <ul className="list-clean">
              {openTasks.map((t) => (
                <li key={t.id}>
                  <span>{t.title}</span>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => resolveTask(t.id)}
                  >
                    Resolve
                  </button>
                </li>
              ))}
              {openTasks.length === 0 && <li>No open tasks.</li>}
            </ul>
          </div>

          <div className="panel">
            <h2>Telemedicine</h2>
            <ul className="list-clean">
              {upcomingTelemed.map((s) => (
                <li key={s.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{s.topic}</strong>
                    <span className="pill pill-muted">{s.status.replace("_", " ")}</span>
                  </div>
                  <div style={{ color: "var(--color-secondary)", fontSize: 12 }}>
                    Requested {fmt(s.requestedAt)}
                  </div>
                  <button className="btn btn-primary" onClick={() => startTelemedFor(s.id)}>
                    Start video room
                  </button>
                </li>
              ))}
              {upcomingTelemed.length === 0 && <li>No pending telemed requests.</li>}
            </ul>
          </div>

          {bridgeEnabled && (
            <BridgeTokensPanel
              patientId={patient.id}
              patientLabel={`${patient.firstName} ${patient.lastName}`}
            />
          )}

        </div>
      </div>
    </>
  );
}
