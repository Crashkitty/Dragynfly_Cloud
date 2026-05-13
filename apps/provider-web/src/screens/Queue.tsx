import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { glucoseStatusLabel, type ProviderQueueItem } from "@dragonfly/shared";
import { api } from "../api.js";

function fmt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function pillFor(status?: ProviderQueueItem["lastReadingStatus"]): string {
  if (!status) return "pill pill-muted";
  if (status === "ok") return "pill pill-success";
  if (status === "warn") return "pill pill-warning";
  return "pill pill-error";
}

export function Queue() {
  const [items, setItems] = useState<ProviderQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  async function load(): Promise<void> {
    setRefreshing(true);
    try {
      const next = await api.queue();
      setItems(next);
      setError(null);
      setRefreshedAt(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // Auto-refresh every 30s so a glucose sync from the bridge or a
    // task created from patient detail surfaces here without manual reloads.
    const t = window.setInterval(() => { void load(); }, 30_000);
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const visible = useMemo(() => {
    if (!items) return [];
    return filter === "flagged" ? items.filter((i) => i.flagged) : items;
  }, [items, filter]);

  const flaggedCount = items?.filter((i) => i.flagged).length ?? 0;
  const taskCount = items?.reduce((s, i) => s + i.openTaskCount, 0) ?? 0;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Patient queue</h1>
          <div className="meta">Diabetes Taiyi Intervention Pilot Study</div>
        </div>
        <div>
          <button
            className={`btn ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter("all")}
            style={{ marginRight: 8 }}
          >
            All
          </button>
          <button
            className={`btn ${filter === "flagged" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilter("flagged")}
            style={{ marginRight: 8 }}
          >
            Flagged ({flaggedCount})
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void load()}
            disabled={refreshing}
            title="Reload the queue now"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Active participants</div>
          <div className="value">{items?.length ?? "—"}</div>
          <div className="delta">in pilot cohort</div>
        </div>
        <div className="kpi">
          <div className="label">Flagged</div>
          <div className="value" style={{ color: flaggedCount > 0 ? "var(--color-warning)" : undefined }}>
            {flaggedCount}
          </div>
          <div className="delta">need provider review</div>
        </div>
        <div className="kpi">
          <div className="label">Open tasks</div>
          <div className="value">{taskCount}</div>
          <div className="delta">across all patients</div>
        </div>
        <div className="kpi">
          <div className="label">Last refresh</div>
          <div className="value" style={{ fontSize: 18 }}>{refreshedAt.toLocaleTimeString()}</div>
          <div className="delta">auto-refreshes every 30s</div>
        </div>
      </div>

      {error && <div className="banner" style={{ background: "#fde2dd", color: "#7a1d10" }}>{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Study ID</th>
            <th>Last reading</th>
            <th>Status</th>
            <th>When</th>
            <th>Tasks</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr key={p.patientId}>
              <td>
                <Link to={`/patients/${p.patientId}`}>{p.patientName}</Link>
              </td>
              <td>{p.studyEnrollmentId}</td>
              <td>{p.lastReadingMgDl != null ? `${p.lastReadingMgDl} mg/dL` : "—"}</td>
              <td>
                <span className={pillFor(p.lastReadingStatus)}>
                  {p.lastReadingStatus ? glucoseStatusLabel(p.lastReadingStatus) : "No data"}
                </span>
              </td>
              <td>{fmt(p.lastReadingAt)}</td>
              <td>{p.openTaskCount}</td>
            </tr>
          ))}
          {items && visible.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--color-secondary)" }}>
                No matching patients.
              </td>
            </tr>
          )}
          {items === null && !error && (
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
