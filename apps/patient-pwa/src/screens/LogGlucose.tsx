import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GLUCOSE_CONTEXTS,
  GLUCOSE_CONTEXT_LABELS,
  GLUCOSE_SOURCES,
  type GlucoseContext,
  type GlucoseSource,
} from "@dragonfly/shared";
import { api } from "../api.js";
import { useSession } from "../session.js";

export function LogGlucose() {
  const { patient } = useSession();
  const nav = useNavigate();
  const [value, setValue] = useState("");
  const [context, setContext] = useState<GlucoseContext>("pre_taiyi");
  const [source, setSource] = useState<GlucoseSource>("manual");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient) return;
    const v = Number(value);
    if (!Number.isFinite(v) || v < 10 || v > 1000) {
      setError("Enter a number between 10 and 1000.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.addGlucose({
        patientId: patient.id,
        valueMgDl: v,
        source,
        context,
        notes: notes.trim() || undefined,
      });
      nav("/", { replace: true });
    } catch (e: unknown) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <>
      <header className="app-bar">
        <h1>Log glucose</h1>
        <button className="pill pill-muted" onClick={() => nav(-1)} type="button">
          Cancel
        </button>
      </header>

      <main className="screen">
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="value">Glucose (mg/dL)</label>
            <input
              id="value"
              className="input"
              type="number"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 120"
              required
              min={10}
              max={1000}
            />
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="context">When was this reading?</label>
            <select
              id="context"
              className="select"
              value={context}
              onChange={(e) => setContext(e.target.value as GlucoseContext)}
            >
              {GLUCOSE_CONTEXTS.map((c) => (
                <option key={c} value={c}>
                  {GLUCOSE_CONTEXT_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="source">Source</label>
            <select
              id="source"
              className="select"
              value={source}
              onChange={(e) => setSource(e.target.value as GlucoseSource)}
            >
              {GLUCOSE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s === "manual" ? "Manual entry" : s === "lancet" ? "Lancet / fingerstick" : "CGM"}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How are you feeling?"
            />
          </div>

          {error && (
            <p className="status-critical" style={{ marginTop: 16 }}>{error}</p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={saving}
            style={{ marginTop: 24 }}
          >
            {saving ? "Saving…" : "Save reading"}
          </button>
        </form>
      </main>
    </>
  );
}
