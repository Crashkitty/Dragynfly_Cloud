// Bridge ↔ Patient-PWA local interface.
//
// This is the single contract every bridge implementation honors,
// regardless of where it actually runs:
//
//   • WebBridgeAdapter (this repo, apps/patient-pwa/src/bridge/webBridge.ts)
//     stores a token in localStorage and emits synthetic readings for
//     demo / development. It is honest about being a simulator.
//
//   • A future native implementation — a Capacitor plugin or a WKWebView
//     / Android WebView bridge — implements the same interface against
//     `native/sensor-bridge/{ios,android}/`. The patient PWA does not
//     change when that lands.
//
// Privacy boundary: the patient PWA never sees the raw bearer token
// after install — it lives in the adapter and is only ever attached to
// outbound `/api/glucose/sync` requests.

import type { GlucoseSyncResult } from "@dragonfly/shared";

export interface BridgeStatus {
  /** True if a bridge token has been installed for this device. */
  tokenInstalled: boolean;
  /** Free-form description of the underlying adapter (e.g. "Web demo bridge"). */
  adapterLabel: string;
  /** Last successful sync, or null. */
  lastSyncedAt: string | null;
  /** Outstanding readings queued locally (always 0 for the web demo). */
  pendingCount: number;
}

export interface BridgeAdapter {
  /** Stable name of the implementation. */
  readonly label: string;

  /** Persist a bridge bearer token issued by `POST /api/auth/bridge-token`. */
  installToken(token: string): Promise<void>;

  /** Forget the installed token. */
  clearToken(): Promise<void>;

  /** Status snapshot for UI. Does not return the raw token. */
  getStatus(): Promise<BridgeStatus>;

  /**
   * Emit one synthetic CGM-style reading and submit it through the
   * authenticated sync path. The reading is honestly tagged
   * (`source: manual`, `vendor: unknown`, `deviceName: "Dragonfly Demo Bridge"`)
   * so it is never confused with real Dexcom/Libre output.
   *
   * Throws if no token is installed or the API rejects the batch.
   */
  emitDemoReading(args: {
    patientId: string;
    valueMgDl: number;
  }): Promise<GlucoseSyncResult>;
}
