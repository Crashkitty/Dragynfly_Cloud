import type { GlucoseSyncBatch, GlucoseSyncResult } from "@dragonfly/shared";
import type { BridgeAdapter, BridgeStatus } from "./types.js";

const TOKEN_STORAGE_KEY = "dragonfly.bridgeToken";
const LAST_SYNC_STORAGE_KEY = "dragonfly.bridgeLastSyncedAt";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8787";

// Web demo bridge. Stores a token in localStorage and emits explicit
// "Dragonfly Demo Bridge" synthetic readings through the same authenticated
// `/api/glucose/sync` path a native bridge would use. It does NOT pretend to
// be Dexcom or Libre — readings are tagged honestly.
export class WebBridgeAdapter implements BridgeAdapter {
  readonly label = "Web demo bridge";

  async installToken(token: string): Promise<void> {
    if (!token.trim()) throw new Error("Token must not be empty");
    localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
  }

  async clearToken(): Promise<void> {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(LAST_SYNC_STORAGE_KEY);
  }

  async getStatus(): Promise<BridgeStatus> {
    return {
      tokenInstalled: Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)),
      adapterLabel: this.label,
      lastSyncedAt: localStorage.getItem(LAST_SYNC_STORAGE_KEY),
      pendingCount: 0,
    };
  }

  async emitDemoReading(args: {
    patientId: string;
    valueMgDl: number;
  }): Promise<GlucoseSyncResult> {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) throw new Error("No bridge token installed.");
    const now = new Date().toISOString();
    // rawDeviceId mixes a stable simulator prefix with the timestamp so
    // `(patientId, rawDeviceId, timestamp)` dedupes naturally on retries.
    const batch: GlucoseSyncBatch = {
      patientId: args.patientId,
      vendor: "unknown",
      deviceName: "Dragonfly Demo Bridge",
      bridgeVersion: "web-demo-0.1.0",
      readings: [
        {
          patientId: args.patientId,
          valueMgDl: args.valueMgDl,
          source: "manual",
          vendor: "unknown",
          deviceName: "Dragonfly Demo Bridge",
          context: chooseContext(),
          timestamp: now,
          readingKind: "manual",
          ingestionPath: "manual",
          rawDeviceId: `web-demo-${now}`,
          notes: "Synthetic demo reading from the web bridge simulator.",
        },
      ],
    };
    const res = await fetch(`${API_BASE}/api/glucose/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sync failed (${res.status}): ${text}`);
    }
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, now);
    return (await res.json()) as GlucoseSyncResult;
  }
}

function chooseContext():
  | "pre_taiyi"
  | "post_taiyi"
  | "before_lunch"
  | "post_lunch_1_to_2h"
  | "post_lunch_3_to_4h"
  | "end_of_day" {
  const hour = new Date().getHours();
  if (hour < 9) return "pre_taiyi";
  if (hour < 11) return "post_taiyi";
  if (hour < 13) return "before_lunch";
  if (hour < 16) return "post_lunch_1_to_2h";
  if (hour < 19) return "post_lunch_3_to_4h";
  return "end_of_day";
}

// Singleton — the patient PWA only needs one bridge instance per session.
export const webBridge: BridgeAdapter = new WebBridgeAdapter();
