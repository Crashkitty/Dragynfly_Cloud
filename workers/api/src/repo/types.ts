import type {
  GlucoseReading,
  MealEntry,
  NewGlucoseReading,
  NewMealEntry,
  NewPatient,
  NewTelemedicineSession,
  Patient,
  PatientOverview,
  ProviderQueueItem,
  ProviderTask,
  TelemedicineSession,
} from "@dragonfly/shared";

// All persistence goes through this interface. V1 ships a Cloudflare D1
// adapter and a dev-only in-memory adapter; both implement this contract.
export interface Repo {
  // Patients
  createPatient(input: NewPatient): Promise<Patient>;
  listPatients(): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | null>;
  getPatientByEnrollmentId(enrollmentId: string): Promise<Patient | null>;

  // Glucose
  addGlucoseReading(input: NewGlucoseReading): Promise<GlucoseReading>;
  // Idempotent insert keyed on (patientId, rawDeviceId, timestamp).
  // Returns null if the reading was already stored. Used by the bridge sync
  // endpoint to safely replay flaky uploads.
  addGlucoseReadingIfNew(input: NewGlucoseReading): Promise<GlucoseReading | null>;
  listGlucoseForPatient(patientId: string, limit?: number): Promise<GlucoseReading[]>;

  // Meals
  addMealEntry(input: NewMealEntry): Promise<MealEntry>;
  listMealsForPatient(patientId: string, limit?: number): Promise<MealEntry[]>;

  // Telemed
  requestTelemedSession(input: NewTelemedicineSession): Promise<TelemedicineSession>;
  listTelemedForPatient(patientId: string): Promise<TelemedicineSession[]>;
  getTelemedSession(sessionId: string): Promise<TelemedicineSession | null>;
  updateTelemedStatus(
    sessionId: string,
    status: TelemedicineSession["status"],
    roomId?: string,
  ): Promise<TelemedicineSession | null>;

  // Provider workflow
  getProviderQueue(): Promise<ProviderQueueItem[]>;
  getPatientOverview(patientId: string): Promise<PatientOverview | null>;
  listOpenTasks(patientId: string): Promise<ProviderTask[]>;
  createProviderTask(patientId: string, title: string): Promise<ProviderTask>;
  updateProviderTaskState(taskId: string, state: ProviderTask["state"]): Promise<ProviderTask | null>;

  // Bridge tokens (sync auth). Tokens are stored as SHA-256 hex, never raw.
  storeBridgeTokenHash(tokenHash: string, patientId: string, label?: string): Promise<void>;
  patientForBridgeTokenHash(tokenHash: string): Promise<string | null>;
  // Staff-facing inventory: returns the 12-char hash prefix (matches the
  // audit-log convention), label, and creation timestamp. Never returns
  // the full hash or anything that could be replayed.
  listBridgeTokensForPatient(patientId: string): Promise<BridgeTokenSummary[]>;
  // Revokes one token by its 12-char hash prefix. Returns the row count
  // touched and the patientId (for audit). The Worker treats the
  // operation as a no-op if zero or more than one row matches the prefix
  // — callers must surface that ambiguity to staff.
  revokeBridgeTokenByHashPrefix(prefix: string): Promise<{ revoked: number; patientId?: string }>;

  // Audit log. Append-only. PHI must not be written into `detail`.
  addAuditEvent(event: NewAuditEvent): Promise<void>;
  listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]>;
}

export interface AuditFilter {
  eventType?: string;
  actorKind?: NewAuditEvent["actorKind"];
  targetKind?: string;
  targetId?: string;
  limit?: number;
}

export interface BridgeTokenSummary {
  /** First 12 hex chars of the SHA-256 token hash. Same convention as the audit log. */
  hashPrefix: string;
  label?: string;
  createdAt: string;
}

export interface NewAuditEvent {
  actorKind: "provider" | "patient" | "bridge" | "coordinator" | "system";
  actorId?: string;
  eventType: string;
  targetKind?: "patient" | "glucose_batch" | "upload" | "telemed_session" | "task";
  targetId?: string;
  outcome: "ok" | "denied" | "invalid" | "error";
  detail?: string;
}

export interface AuditEvent extends NewAuditEvent {
  id: string;
  occurredAt: string;
}
