import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useSession } from "../session.js";

export function Login() {
  const { setPatient } = useSession();
  const nav = useNavigate();
  const [enrollmentId, setEnrollmentId] = useState("TY-0001");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    const id = enrollmentId.trim();
    if (!id) { setError("Enter a study ID."); return; }
    setError(null);
    setLoading(true);
    try {
      const patient = await api.patientByEnrollment(id);
      setPatient(patient);
      nav("/", { replace: true });
    } catch (e) {
      const msg = String(e);
      // Distinguish "no such ID" from "API unreachable" so the
      // participant gets actionable text instead of a generic failure.
      if (msg.includes("404")) {
        setError(
          "We don't recognize that study ID. Try TY-0001, TY-0002, or TY-0003 in dev.",
        );
      } else if (msg.startsWith("API ") || msg.includes("Failed to fetch")) {
        setError(
          "We couldn't reach the Dragonfly server. Ask your coordinator to check the connection.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-stage">
      <div className="brand">
        <div className="logo" aria-hidden>
          ✦
        </div>
        <h1>Dragonfly</h1>
        <p>Diabetes Taiyi Intervention Pilot Study</p>
      </div>

      <form className="card" onSubmit={activate}>
        <h2>Activate your study ID</h2>
        <p style={{ color: "var(--color-secondary)", marginBottom: 16 }}>
          Enter the participant ID your study coordinator gave you.
        </p>
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="enrollment">Study ID</label>
          <input
            id="enrollment"
            className="input"
            value={enrollmentId}
            onChange={(e) => setEnrollmentId(e.target.value)}
            placeholder="TY-0001"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 24,
          }}
          aria-label="Demo study IDs"
        >
          {(["TY-0001", "TY-0002", "TY-0003"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className="pill pill-muted"
              onClick={() => setEnrollmentId(id)}
              style={{ border: "none", cursor: "pointer" }}
              title={`Use seeded participant ${id}`}
            >
              {id}
            </button>
          ))}
        </div>
        {error && (
          <p className="status-critical" style={{ marginBottom: 16 }}>{error}</p>
        )}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>

      <p className="mvp-banner">
        Privacy-first clinical research workflow scaffold. Not for
        clinical use yet. The pills above are seeded demo participants —
        in a real deployment, your coordinator hands you your study ID.
      </p>
    </div>
  );
}
