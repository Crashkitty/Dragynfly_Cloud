import { NavLink, Route, Routes } from "react-router-dom";
import { Queue } from "./screens/Queue.js";
import { PatientDetail } from "./screens/PatientDetail.js";
import { Audit } from "./screens/Audit.js";
import { StaffAuthGate } from "./components/StaffAuthGate.js";

export default function App() {
  return (
    <StaffAuthGate>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo">✦</span>
            <span>Dragonfly</span>
          </div>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Patient queue
          </NavLink>
          <NavLink to="/audit" className={({ isActive }) => (isActive ? "active" : "")}>
            Audit review
          </NavLink>
          <div className="footer">
            Privacy-first clinical research workflow scaffold.<br />
            Designed with healthcare security requirements in mind. Not
            yet HIPAA-compliant.
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Queue />} />
            <Route path="/patients/:patientId" element={<PatientDetail />} />
            <Route path="/audit" element={<Audit />} />
          </Routes>
        </main>
      </div>
    </StaffAuthGate>
  );
}
