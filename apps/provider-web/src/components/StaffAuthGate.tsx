import { useState } from "react";
import {
  clearLocalSecret,
  isStaffAuthReady,
  setLocalSecret,
  staffAuthMode,
} from "../staffAuth.js";

// Wraps the dashboard. Renders children only after the staff trust path
// is satisfied:
//   - cloudflare-access: always (Access is in front, this is a passthrough)
//   - local-dev        : after the operator pastes the shared secret
//
// In production deployments this component should be effectively invisible:
// the Cloudflare Access cookie is required *before* the bundle even loads,
// so by the time React renders the gate already passes. The visible gate is
// for local development; we render it anyway in production mode to keep one
// code path and to make the boundary explicit if someone misconfigures the
// build.

export function StaffAuthGate({ children }: { children: React.ReactNode }) {
  const mode = staffAuthMode();
  const [ready, setReady] = useState(isStaffAuthReady());
  const [pending, setPending] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (ready) {
    return (
      <>
        <StaffBoundaryBanner />
        {children}
      </>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pending.trim()) {
      setError("Enter the staff secret configured on the Worker.");
      return;
    }
    setLocalSecret(pending.trim());
    setPending("");
    setError(null);
    setReady(true);
  }

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        background: "var(--color-neutral)",
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "var(--color-surface)",
          borderRadius: 12,
          boxShadow: "var(--shadow-card)",
          padding: 28,
          width: "min(420px, 100%)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Dragonfly · staff sign-in
        </div>
        <div style={{ fontSize: 13, color: "var(--color-secondary)", marginBottom: 16 }}>
          {mode === "cloudflare-access" ? (
            <>
              Production builds expect Cloudflare Access in front of this
              app. If you're seeing this prompt, either Access is
              misconfigured or the build mode is wrong.
            </>
          ) : (
            <>
              This is a local-dev sign-in. Enter the shared secret from
              the Worker's <code>STAFF_LOCAL_SECRET</code>. In production
              this surface sits behind Cloudflare Access — there is no
              password flow.
            </>
          )}
        </div>
        <div className="field">
          <label htmlFor="staff-secret">Staff local secret</label>
          <input
            id="staff-secret"
            className="input"
            type="password"
            autoComplete="off"
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            placeholder="paste secret"
          />
        </div>
        {error && (
          <div
            className="banner"
            style={{ background: "#fde2dd", color: "#7a1d10", marginTop: 8 }}
          >
            {error}
          </div>
        )}
        <button className="btn btn-primary" type="submit" style={{ marginTop: 12, width: "100%" }}>
          Continue
        </button>
        <div style={{ fontSize: 12, color: "var(--color-secondary)", marginTop: 12 }}>
          Privacy posture: this app does not implement enterprise IdP login.
          Staff identity comes from Cloudflare Access in production, or this
          shared secret in dev. See <code>docs/CLOUDFLARED.md</code>.
        </div>
      </form>
    </div>
  );
}

function StaffBoundaryBanner() {
  const mode = staffAuthMode();
  const label = mode === "cloudflare-access" ? "Cloudflare Access" : "Local-dev secret";
  const tone = mode === "cloudflare-access" ? "var(--color-success)" : "var(--color-warning)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 16px",
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-outline)",
        fontSize: 12,
        color: "var(--color-secondary)",
      }}
    >
      <div>
        <strong style={{ color: "var(--color-on-neutral)" }}>Staff-only surface.</strong>{" "}
        Trust path: <span style={{ color: tone, fontWeight: 600 }}>{label}</span>
        {mode === "local-dev" && (
          <>
            {" — "}
            <button
              onClick={() => {
                clearLocalSecret();
                location.reload();
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: "var(--color-primary)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              forget secret
            </button>
          </>
        )}
      </div>
      <div>Not for patient use.</div>
    </div>
  );
}
