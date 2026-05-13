import type {
  PatientOverview,
  ProviderQueueItem,
  ProviderTask,
  TelemedicineSession,
} from "@dragonfly/shared";
import type { AuditEvent, BridgeTokenSummary, MintedBridgeToken } from "./types.js";
import { staffAuthHeaders } from "./staffAuth.js";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";
export const TELEMED_BASE = (import.meta.env.VITE_TELEMED_BASE_URL as string | undefined) ??
  "http://localhost:8788";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  // Every staff request gets the staff auth headers. In cloudflare-access
  // mode this is empty (Access cookie + headers are upstream); in
  // local-dev it's the X-Staff-Local-Secret matching STAFF_LOCAL_SECRET.
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...staffAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  queue: () => http<ProviderQueueItem[]>(`/api/provider/queue`),
  overview: (patientId: string) =>
    http<PatientOverview>(`/api/patients/${encodeURIComponent(patientId)}/overview`),
  tasks: (patientId: string) =>
    http<ProviderTask[]>(`/api/provider/tasks?patientId=${encodeURIComponent(patientId)}`),
  createTask: (patientId: string, title: string) =>
    http<ProviderTask>(`/api/provider/tasks`, {
      method: "POST",
      body: JSON.stringify({ patientId, title }),
    }),
  resolveTask: (taskId: string) =>
    http<ProviderTask>(`/api/provider/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "resolved" }),
    }),
  updateTelemedStatus: (sessionId: string, status: TelemedicineSession["status"], roomId?: string) =>
    http<TelemedicineSession>(`/api/telemed/${encodeURIComponent(sessionId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, roomId }),
    }),
  // Idempotent: server reuses an existing roomId, mints one if absent.
  startTelemed: (sessionId: string) =>
    http<TelemedicineSession>(`/api/telemed/${encodeURIComponent(sessionId)}/start`, {
      method: "POST",
    }),
  // Bridge token provisioning — staff-only. Mint returns the raw token
  // exactly once; list returns hash prefixes only; revoke takes a 12-char
  // prefix. The Worker refuses ambiguous prefixes (zero or multiple
  // matches), so the UI surfaces the result as-is.
  listBridgeTokens: (patientId: string) =>
    http<BridgeTokenSummary[]>(
      `/api/provisioning/bridge-tokens?patientId=${encodeURIComponent(patientId)}`,
    ),
  mintBridgeToken: (patientId: string, label?: string) =>
    http<MintedBridgeToken>(`/api/provisioning/bridge-tokens`, {
      method: "POST",
      body: JSON.stringify({ patientId, label }),
    }),
  revokeBridgeToken: (hashPrefix: string) =>
    http<{ revoked: number; patientId?: string }>(
      `/api/provisioning/bridge-tokens/${encodeURIComponent(hashPrefix)}`,
      { method: "DELETE" },
    ),
  // Audit review — staff-only. Filter params are optional; the server
  // defaults to most recent first and a hard cap of 200 rows.
  auditEvents: (params: {
    eventType?: string;
    targetKind?: string;
    targetId?: string;
    actorKind?: string;
    limit?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.eventType) qs.set("eventType", params.eventType);
    if (params.targetKind) qs.set("targetKind", params.targetKind);
    if (params.targetId) qs.set("targetId", params.targetId);
    if (params.actorKind) qs.set("actorKind", params.actorKind);
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return http<AuditEvent[]>(`/api/audit${q ? `?${q}` : ""}`);
  },
};
