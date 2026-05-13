// Provider-web local types. Kept here rather than in @dragonfly/shared
// because the AuditEvent shape is operational data — only the staff
// surface ever consumes it. Mirrors `workers/api/src/repo/types.ts`.

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorKind: "provider" | "patient" | "bridge" | "coordinator" | "system";
  actorId?: string;
  eventType: string;
  targetKind?: "patient" | "glucose_batch" | "upload" | "telemed_session" | "task";
  targetId?: string;
  outcome: "ok" | "denied" | "invalid" | "error";
  detail?: string;
}

export interface BridgeTokenSummary {
  hashPrefix: string;
  label?: string;
  createdAt: string;
}

export interface MintedBridgeToken {
  patientId: string;
  label?: string;
  hashPrefix: string;
  /** Raw bearer — shown ONCE to the staff member, never persisted. */
  token: string;
  note: string;
}
