import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import type { AuditEvent } from "../types.js";

// Audit review — operational read surface, not analytics. Shows the most
// recent audit_log rows so staff can verify what the Worker recorded.
//
// Columns are deliberately minimal: when, actor, event, target, outcome,
// short detail. The same rule that governs writes (no PHI in `detail`) is
// what makes this screen safe to show to any staff member with the staff
// trust path; we just render what the Worker already returned.

const EVENT_OPTIONS = [
  "",
  "patient.viewed",
  "bridge_token.minted",
  "bridge_token.revoke",
  "glucose.sync.accepted",
  "glucose.sync.invalid",
  "glucose.sync.denied",
  "upload.signed",
  "telemed.session.created",
  "telemed.session.updated",
  "telemed.session.started",
  "audit.viewed",
];

const ACTOR_OPTIONS = ["", "provider", "patient", "bridge", "coordinator", "system"];

function absoluteFmt(iso: string): string {
  return new Date(iso).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function relativeFmt(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const secs = Math.round(diff / 1000);
  if (secs < 45) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 45) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days} d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function pillForOutcome(outcome: AuditEvent["outcome"]): string {
  if (outcome === "ok") return "pill pill-success";
  if (outcome === "denied" || outcome === "invalid") return "pill pill-warning";
  return "pill pill-error";
}

// Faint colour cue per event family; keeps the table scannable without
// turning it into a dashboard. Same hue across the family
// (glucose.*, telemed.*, bridge_token.*) so the eye groups them.
function eventTone(eventType: string): string {
  if (eventType.startsWith("glucose.")) return "#0e5a6f";
  if (eventType.startsWith("telemed.")) return "#9e4a1f";
  if (eventType.startsWith("bridge_token.")) return "#2e6b47";
  if (eventType === "patient.viewed") return "#4a5c66";
  if (eventType === "upload.signed") return "#4a5c66";
  if (eventType === "audit.viewed") return "#8a8f95";
  return "var(--color-on-neutral)";
}

export function Audit() {
  const [rows, setRows] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eventType, setEventType] = useState("");
  const [actorKind, setActorKind] = useState("");
  const [targetId, setTargetId] = useState("");
  // Tick once a minute so the "X min ago" labels stay live without the
  // heavier cost of a 1s clock.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  async function load(opts: {
    eventType?: string;
    actorKind?: string;
    targetId?: string;
  } = {}): Promise<void> {
    setBusy(true);
    try {
      const next = await api.auditEvents({
        eventType: (opts.eventType ?? eventType) || undefined,
        actorKind: (opts.actorKind ?? actorKind) || undefined,
        targetId: (opts.targetId ?? targetId).trim() || undefined,
        limit: 200,
      });
      setRows(next);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyEvent(value: string): void {
    setEventType(value);
    void load({ eventType: value });
  }
  function applyTarget(value: string): void {
    setTargetId(value);
    void load({ targetId: value });
  }
  function applyActor(value: string): void {
    setActorKind(value);
    void load({ actorKind: value });
  }
  function clearAll(): void {
    setEventType("");
    setActorKind("");
    setTargetId("");
    void load({ eventType: "", actorKind: "", targetId: "" });
  }

  const counts = useMemo(() => {
    if (!rows) return { total: 0, denied: 0, invalid: 0 };
    return rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.outcome === "denied") acc.denied += 1;
        if (r.outcome === "invalid") acc.invalid += 1;
        return acc;
      },
      { total: 0, denied: 0, invalid: 0 },
    );
  }, [rows]);

  const activeFilters =
    Number(Boolean(eventType)) + Number(Boolean(actorKind)) + Number(Boolean(targetId.trim()));

  return (
    <>
      <div className="topbar">
        <div>
          <Link to="/">← Queue</Link>
          <h1 style={{ marginTop: 4 }}>Audit review</h1>
          <div className="meta">
            Operational review of the append-only audit log. No PHI is stored
            in audit rows; see <code>docs/AUDIT_LOG.md</code>.
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()} disabled={busy}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Rows shown</div>
          <div className="value">{counts.total}</div>
          <div className="delta">most recent first · capped at 200</div>
        </div>
        <div className="kpi">
          <div className="label">Denied</div>
          <div
            className="value"
            style={{ color: counts.denied > 0 ? "var(--color-warning)" : undefined }}
          >
            {counts.denied}
          </div>
          <div className="delta">in the visible window</div>
        </div>
        <div className="kpi">
          <div className="label">Invalid</div>
          <div className="value">{counts.invalid}</div>
          <div className="delta">malformed or rejected</div>
        </div>
        <div className="kpi">
          <div className="label">Filters</div>
          <div className="value">{activeFilters}</div>
          <div className="delta">{activeFilters > 0 ? "narrowed view" : "unfiltered"}</div>
        </div>
      </div>

      <div
        className="panel"
        style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="evt">Event type</label>
          <select
            id="evt"
            className="input"
            value={eventType}
            onChange={(e) => applyEvent(e.target.value)}
          >
            {EVENT_OPTIONS.map((e) => (
              <option key={e} value={e}>
                {e || "(any)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="actor">Actor</label>
          <select
            id="actor"
            className="input"
            value={actorKind}
            onChange={(e) => applyActor(e.target.value)}
          >
            {ACTOR_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a || "(any)"}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
          <label htmlFor="target">Target ID</label>
          <input
            id="target"
            className="input"
            placeholder="patient or session uuid · click any target cell to fill"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void load();
              }
            }}
          />
        </div>
        <button className="btn btn-primary" onClick={() => void load()} disabled={busy}>
          Apply
        </button>
        <button
          className="btn btn-secondary"
          onClick={clearAll}
          disabled={busy || activeFilters === 0}
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="banner" style={{ background: "#fde2dd", color: "#7a1d10" }}>
          {error}
        </div>
      )}

      <table className="table audit-table">
        <thead>
          <tr>
            <th style={{ width: 140 }}>When</th>
            <th style={{ width: 200 }}>Actor</th>
            <th>Event</th>
            <th>Target</th>
            <th style={{ width: 90 }}>Outcome</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: "nowrap" }} title={absoluteFmt(r.occurredAt)}>
                {relativeFmt(r.occurredAt, now)}
              </td>
              <td>
                <div>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => applyActor(r.actorKind)}
                    title={`Filter by actor: ${r.actorKind}`}
                  >
                    {r.actorKind}
                  </button>
                </div>
                {r.actorId && (
                  <div
                    style={{
                      color: "var(--color-secondary)",
                      fontSize: 12,
                      fontFamily: "monospace",
                      wordBreak: "break-all",
                    }}
                  >
                    {r.actorId}
                  </div>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="link-btn"
                  style={{
                    color: eventTone(r.eventType),
                    fontFamily: "monospace",
                    fontSize: 13,
                  }}
                  onClick={() => applyEvent(r.eventType)}
                  title={`Filter by event: ${r.eventType}`}
                >
                  {r.eventType}
                </button>
              </td>
              <td>
                {r.targetKind ? (
                  <>
                    <div>{r.targetKind}</div>
                    {r.targetId && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => applyTarget(r.targetId!)}
                        title="Filter by this target id"
                        style={{
                          color: "var(--color-secondary)",
                          fontSize: 12,
                          fontFamily: "monospace",
                          wordBreak: "break-all",
                        }}
                      >
                        {r.targetId}
                      </button>
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--color-secondary)" }}>—</span>
                )}
              </td>
              <td>
                <span className={pillForOutcome(r.outcome)}>{r.outcome}</span>
              </td>
              <td style={{ color: "var(--color-secondary)", fontSize: 13 }}>
                {r.detail ?? "—"}
              </td>
            </tr>
          ))}
          {rows && rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--color-secondary)" }}>
                No audit rows match these filters.
              </td>
            </tr>
          )}
          {rows === null && !error && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--color-secondary)" }}>
                Loading…
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
