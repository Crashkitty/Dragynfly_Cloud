import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  GLUCOSE_CONTEXT_LABELS,
  glucoseStatusLabel,
  type GlucoseReading,
} from "@dragonfly/shared";
import { api } from "../api.js";
import { useSession } from "../session.js";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function pillClassFor(status: GlucoseReading["status"]): string {
  if (status === "ok") return "pill pill-success";
  if (status === "warn") return "pill pill-warning";
  return "pill pill-error";
}

export function Dashboard() {
  const { patient } = useSession();
  const [readings, setReadings] = useState<GlucoseReading[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patient) return;
    let alive = true;
    const load = () => {
      api
        .glucoseList(patient.id)
        .then((r) => { if (alive) { setReadings(r); setError(null); } })
        .catch((e) => { if (alive) setError(String(e)); });
    };
    load();
    // Refresh when the user returns to the tab so a reading just synced
    // from the bridge or just logged manually appears without a manual
    // page reload.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [patient]);

  const latest = readings[0];

  return (
    <>
      <header className="app-bar">
        <h1>Hi, {patient?.firstName}</h1>
        <span className="right">{patient?.studyEnrollmentId}</span>
      </header>

      <main className="screen">
        <section className="card">
          <h2>Latest reading</h2>
          {latest ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span className="numeric-display">{latest.valueMgDl}</span>
                <span style={{ color: "var(--color-secondary)" }}>mg/dL</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <span className={pillClassFor(latest.status)}>
                  {glucoseStatusLabel(latest.status)}
                </span>
                <span style={{ color: "var(--color-secondary)" }}>
                  {GLUCOSE_CONTEXT_LABELS[latest.context]} · {fmtTime(latest.timestamp)}
                </span>
              </div>
            </>
          ) : (
            <p style={{ color: "var(--color-secondary)" }}>
              No readings yet. Tap "Log glucose" to add one.
            </p>
          )}
          <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
            <Link to="/log" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Log glucose
            </Link>
            <Link to="/food" className="btn btn-secondary" style={{ textDecoration: "none" }}>
              Add a meal
            </Link>
          </div>
        </section>

        <section className="card">
          <h2>Today's Taiyi</h2>
          <p style={{ color: "var(--color-secondary)" }}>
            Master Zhong's morning routine — 12 minutes. Tap to begin.
          </p>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-secondary" type="button" disabled>
              Video coming soon
            </button>
          </div>
        </section>

        <h2 className="section-title">Recent readings</h2>
        {error && <p className="status-critical">{error}</p>}
        <ul className="list">
          {readings.slice(0, 6).map((r) => (
            <li key={r.id}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 20 }}>{r.valueMgDl} mg/dL</div>
                <div className="meta">
                  <span>{GLUCOSE_CONTEXT_LABELS[r.context]}</span>
                  <span>{fmtTime(r.timestamp)}</span>
                </div>
              </div>
              <span className={pillClassFor(r.status)}>{glucoseStatusLabel(r.status)}</span>
            </li>
          ))}
          {readings.length === 0 && !error && (
            <li>
              <span style={{ color: "var(--color-secondary)" }}>No readings yet.</span>
            </li>
          )}
        </ul>
      </main>
    </>
  );
}
