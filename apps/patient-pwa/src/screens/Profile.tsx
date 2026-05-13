import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../session.js";
import { bridgeEnabled } from "../features.js";

export function Profile() {
  const { patient, setPatient } = useSession();
  const nav = useNavigate();

  if (!patient) return null;

  function signOut() {
    setPatient(null);
    nav("/login", { replace: true });
  }

  return (
    <>
      <header className="app-bar">
        <h1>Profile</h1>
      </header>
      <main className="screen">
        <section className="card">
          <h2>{patient.firstName} {patient.lastName}</h2>
          <p style={{ color: "var(--color-secondary)" }}>
            Study ID {patient.studyEnrollmentId}
          </p>
        </section>

        <section className="card">
          <h3>About this study</h3>
          <p>
            The Diabetes Taiyi Intervention Pilot Study explores how the
            Master Zhong Taiyi routine, paired with daily glucose tracking
            and gentle meal logging, supports your wellbeing.
          </p>
          <p style={{ marginTop: 12, color: "var(--color-secondary)" }}>
            Questions? Tap "Care" and request a callback.
          </p>
        </section>

        {bridgeEnabled && (
          <section className="card">
            <h3>Sensor bridge</h3>
            <p style={{ color: "var(--color-secondary)" }}>
              Connect a continuous glucose sensor through your study
              coordinator's bridge token. The web demo simulator is
              available for testing.
            </p>
            <Link
              to="/bridge"
              className="btn btn-secondary"
              style={{ marginTop: 16, textDecoration: "none" }}
            >
              Open sensor bridge
            </Link>
          </section>
        )}

        <section className="card">
          <h3>Medications on file</h3>
          {patient.medications && patient.medications.length > 0 ? (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {patient.medications.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--color-secondary)" }}>No medications on file.</p>
          )}
        </section>

        <button className="btn btn-ghost" onClick={signOut} type="button">
          Sign out
        </button>

        <p className="mvp-banner">
          Privacy-first clinical research workflow scaffold. Designed
          with healthcare security requirements in mind; not yet
          HIPAA-compliant.
        </p>
      </main>
    </>
  );
}
