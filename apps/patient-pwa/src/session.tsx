import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Patient } from "@dragonfly/shared";

interface SessionState {
  patient: Patient | null;
  setPatient: (p: Patient | null) => void;
}

const SessionContext = createContext<SessionState | null>(null);

const STORAGE_KEY = "dragonfly.patient";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [patient, setPatientState] = useState<Patient | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Patient) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (patient) localStorage.setItem(STORAGE_KEY, JSON.stringify(patient));
    else localStorage.removeItem(STORAGE_KEY);
  }, [patient]);

  return (
    <SessionContext.Provider value={{ patient, setPatient: setPatientState }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
