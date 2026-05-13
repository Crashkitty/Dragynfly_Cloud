// TypeScript surface for the Capacitor plugin. The shapes mirror
// `BridgeStatus` and `GlucoseSyncResult` from the patient PWA so the
// runtime shim in `apps/patient-pwa/public/dragonfly-shell-shim.js`
// can hand objects straight through without translation.

export interface BridgeStatus {
  tokenInstalled: boolean;
  adapterLabel: string;
  lastSyncedAt: string | null;
  pendingCount: number;
}

export interface GlucoseSyncResult {
  accepted: number;
  duplicates: number;
  rejected: Array<{ index: number; reason: string }>;
}

export interface DragonflySensorBridgePlugin {
  /**
   * Persist the bearer token in the platform secure store
   * (iOS Keychain, Android EncryptedSharedPreferences). The token is
   * never returned to the WebView again — `getStatus` only reports
   * whether one is installed.
   */
  installToken(options: { token: string }): Promise<void>;

  /** Forget the installed token and any cached metadata. */
  clearToken(): Promise<void>;

  /** Status snapshot for the UI. Does not return the raw token. */
  getStatus(): Promise<BridgeStatus>;

  /**
   * Submit one synthetic CGM-style reading through `POST /api/glucose/sync`.
   * The native code attaches the stored bearer; the WebView never sees it.
   * The reading is tagged honestly (`vendor: "unknown"`,
   * `deviceName: "Dragonfly Demo Bridge"`, `source: "manual"`).
   */
  emitDemoReading(options: {
    patientId: string;
    valueMgDl: number;
  }): Promise<GlucoseSyncResult>;

  /**
   * **Android only.** Enable NFC reader mode for `timeoutMs`, await a
   * Libre sensor tap, attempt to extract the most recent reading, and
   * (if successful) POST it through `/api/glucose/sync`. The native
   * plugin holds the bearer token; the WebView never sees it.
   *
   * Resolution shape (one of):
   *  - `{ sensorType: "LIBRE_1", valueMgDl, timestampIso, sync, sensorUid }`
   *    — read succeeded and was synced. `sync` is the `GlucoseSyncResult`.
   *  - `{ sensorType: "LIBRE_2_GEN1" | "LIBRE_3" | ..., unsupportedReason }`
   *    — sensor detected but its data path isn't implemented yet.
   *  - `{ error: "..." }` — NFC unavailable, no tap within timeout,
   *    tag-read failure, or server sync error (in `syncError`).
   *
   * iOS shells reject with `Unimplemented` — Libre NFC on iOS needs an
   * Apple `com.apple.developer.nfc.readersession.formats` entitlement
   * and a different NFC API; not in V1.5 scope.
   */
  readLibreOnce(options: {
    patientId: string;
    timeoutMs?: number;
  }): Promise<LibreReadResult>;

  /**
   * **Android only.** Brief foreground BLE connect to a Dexcom G6
   * transmitter, authenticate with the user-supplied transmitter ID,
   * wait for the next 5-minute glucose notification (up to ~6 min by
   * default), POST it, disconnect. The patient PWA never sees the bearer.
   */
  readDexcomG6Once(options: {
    patientId: string;
    transmitterId: string;
    timeoutMs?: number;
  }): Promise<DexcomReadResult>;

  /**
   * **Android only, partial.** Connect to a Dexcom G7 transmitter and
   * walk the published pairing sequence up to the J-PAKE wall. Without
   * a `certJwt` (per-transmitter Dexcom-signed certificate, currently
   * obtained out-of-band — see docs/V1_5_PLAN.md step 5), the call
   * resolves with `stage: "STAGE_PAIRING_NEEDS_CERT"`.
   */
  readDexcomG7Once(options: {
    patientId: string;
    transmitterIdSuffix: string;
    certJwt?: string;
    timeoutMs?: number;
  }): Promise<DexcomG7ReadResult>;
}

export interface DexcomReadResult {
  vendor: "dexcom-g6";
  transmitterIdLast2?: string;
  deviceName?: string;
  valueMgDl?: number | null;
  trend?: string;
  timestampIso?: string;
  error?: string;
  sync?: GlucoseSyncResult;
  syncError?: string;
}

export interface DexcomG7ReadResult {
  vendor: "dexcom-g7";
  deviceName?: string;
  stage:
    | "BLE_UNAVAILABLE"
    | "NOT_FOUND"
    | "SERVICE_MISMATCH"
    | "STAGE_PAIRING_NEEDS_CERT"
    | "STAGE_PAIRING_REJECTED"
    | "READING_OK"
    | "ERROR";
  valueMgDl?: number | null;
  trend?: string;
  timestampIso?: string;
  message?: string;
  error?: string;
  sync?: GlucoseSyncResult;
  syncError?: string;
}

export interface LibreReadResult {
  sensorType?:
    | "LIBRE_1"
    | "LIBRE_2_GEN1"
    | "LIBRE_2_GEN2"
    | "LIBRE_PRO"
    | "LIBRE_3"
    | "LIBRE_3_PLUS"
    | "UNKNOWN";
  sensorUid?: string;
  valueMgDl?: number | null;
  timestampIso?: string;
  unsupportedReason?: string;
  error?: string;
  /** Present only when the read was synced through `/api/glucose/sync`. */
  sync?: GlucoseSyncResult;
  /** Present when the read succeeded but the POST failed. */
  syncError?: string;
}
