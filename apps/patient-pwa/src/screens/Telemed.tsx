import { useEffect, useState } from "react";
import type { TelemedicineSession } from "@dragonfly/shared";
import { api, TELEMED_BASE } from "../api.js";
import { useSession } from "../session.js";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export function Telemed() {
  const { patient } = useSession();
  const [sessions, setSessions] = useState<TelemedicineSession[] | null>(null);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(): Promise<void> {
    if (!patient) return;
    try {
      setSessions(await api.telemedList(patient.id));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
    // Refresh on focus so a patient sees a provider-started session
    // appear without manually reloading.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!patient || !topic.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.requestTelemed({ patientId: patient.id, topic: topic.trim() });
      setTopic("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // Show "Join now" only when the provider has already started the
  // session and a stable roomId has been minted server-side.
  const live = (sessions ?? []).find(
    (s) => s.status === "in_progress" && Boolean(s.roomId),
  );

  return (
    <>
      <header className="app-bar">
        <h1>Care team</h1>
      </header>
      <main className="screen">
        {live && (
          <section className="card">
            <h2>Your provider is ready</h2>
            <p style={{ color: "var(--color-secondary)" }}>
              {live.topic} — tap to join.
            </p>
            <a
              className="btn btn-primary"
              style={{ marginTop: 16, textDecoration: "none" }}
              href={`${TELEMED_BASE}/r/${live.roomId}`}
              target="_blank"
              rel="noopener"
            >
              Join video room
            </a>
          </section>
        )}

        <form className="card" onSubmit={submit}>
          <h2>Request a callback</h2>
          <p style={{ color: "var(--color-secondary)", marginTop: 4 }}>
            Your provider will start a video room when they're ready. You'll
            see a "Join" button here once it's live.
          </p>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="topic">What would you like to discuss?</label>
            <input
              id="topic"
              className="input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="High readings after lunch"
              required
            />
          </div>
          {error && <p className="status-critical" style={{ marginTop: 16 }}>{error}</p>}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving}
            style={{ marginTop: 24 }}
          >
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </form>

        <h2 className="section-title">Your requests</h2>
        <ul className="list">
          {sessions === null && (
            <li>
              <span style={{ color: "var(--color-secondary)" }}>Loading…</span>
            </li>
          )}
          {sessions !== null && sessions.length === 0 && (
            <li>
              <span style={{ color: "var(--color-secondary)" }}>No open requests yet.</span>
            </li>
          )}
          {(sessions ?? []).map((s) => (
            <li key={s.id}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 18 }}>{s.topic}</div>
                <div className="meta">
                  <span>Requested {fmtTime(s.requestedAt)}</span>
                  <span>Status: {s.status.replace("_", " ")}</span>
                </div>
              </div>
              {s.status === "in_progress" && s.roomId && (
                <a
                  className="pill pill-success"
                  href={`${TELEMED_BASE}/r/${s.roomId}`}
                  target="_blank"
                  rel="noopener"
                  style={{ textDecoration: "none" }}
                >
                  Join
                </a>
              )}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
