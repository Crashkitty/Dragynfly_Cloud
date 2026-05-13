import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./session.js";
import { Login } from "./screens/Login.js";
import { Dashboard } from "./screens/Dashboard.js";
import { LogGlucose } from "./screens/LogGlucose.js";
import { FoodDiary } from "./screens/FoodDiary.js";
import { Telemed } from "./screens/Telemed.js";
import { Profile } from "./screens/Profile.js";
import { Bridge } from "./screens/Bridge.js";
import { bridgeEnabled } from "./features.js";

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { patient } = useSession();
  if (!patient) return <Navigate to="/login" replace />;
  return (
    <div className="app-shell">
      {children}
      <nav className="bottom-nav" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="icon" aria-hidden>🏠</span>
          <span>Home</span>
        </NavLink>
        <NavLink to="/log" className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="icon" aria-hidden>📊</span>
          <span>Logs</span>
        </NavLink>
        <NavLink to="/telemed" className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="icon" aria-hidden>💬</span>
          <span>Care</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="icon" aria-hidden>👤</span>
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<div className="app-shell"><Login /></div>} />
        <Route
          path="/"
          element={
            <ProtectedShell>
              <Dashboard />
            </ProtectedShell>
          }
        />
        <Route
          path="/log"
          element={
            <ProtectedShell>
              <LogGlucose />
            </ProtectedShell>
          }
        />
        <Route
          path="/food"
          element={
            <ProtectedShell>
              <FoodDiary />
            </ProtectedShell>
          }
        />
        <Route
          path="/telemed"
          element={
            <ProtectedShell>
              <Telemed />
            </ProtectedShell>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedShell>
              <Profile />
            </ProtectedShell>
          }
        />
        {bridgeEnabled && (
          <Route
            path="/bridge"
            element={
              <ProtectedShell>
                <Bridge />
              </ProtectedShell>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}
