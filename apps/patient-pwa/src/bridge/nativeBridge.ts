import type { GlucoseSyncResult } from "@dragonfly/shared";
import type { BridgeAdapter, BridgeStatus } from "./types.js";

// Native bridge adapter — talks to a host-injected object the iOS / Android
// shell exposes on `window`. The PWA never sees the raw bridge token after
// install: the host stores it in the platform keystore (iOS Keychain,
// Android Keystore-backed EncryptedSharedPreferences) and attaches it to
// outbound `/api/glucose/sync` requests itself. The adapter only ever
// gets back a redacted `BridgeStatus`.
//
// The host is expected to expose, at first paint, an object matching
// `NativeBridgeHost` below — by Capacitor `WebView.addJavascriptInterface`,
// WKScriptMessageHandler shim, or `window.webkit.messageHandlers` wrapped
// in a thin `window.DragonflyBridge` shim. See
// `native/sensor-bridge/README.md` § "Web ↔ native contract" for the exact
// JS surface a shell must implement.
//
// `isNativeBridgePresent()` is the runtime selector the PWA uses to choose
// between this and the web demo; it stays cheap so it's safe to call on
// every render.

declare global {
  interface Window {
    DragonflyBridge?: NativeBridgeHost;
  }
}

export interface NativeBridgeHost {
  /** Stable label for the host (e.g. "iOS native bridge 0.1.0"). */
  readonly label: string;

  /** Platform string (e.g. "android", "ios", "native"). Optional. */
  readonly platform?: string;

  /**
   * Persist a bridge bearer token in the platform secure store. The token
   * MUST NOT be returned to the WebView again; subsequent `getStatus`
   * calls only report whether one is installed.
   */
  installToken(token: string): Promise<void> | void;

  /** Forget the installed token and any cached metadata. */
  clearToken(): Promise<void> | void;

  /** Status snapshot for the UI. Must not include the raw token. */
  getStatus(): Promise<BridgeStatus> | BridgeStatus;

  /**
   * Submit one synthetic CGM-style reading through the host's authenticated
   * sync path. The host attaches the stored bearer token; the WebView never
   * sees it. The reading must be tagged honestly (`source: manual`,
   * `vendor: unknown`, `deviceName: "Dragonfly Demo Bridge"`) — emitting
   * synthetic data as if it were real Dexcom/Libre output is a contract
   * violation.
   */
  emitDemoReading(args: {
    patientId: string;
    valueMgDl: number;
  }): Promise<GlucoseSyncResult>;

  /**
   * Android-only at V1.5: enable NFC reader mode, await a Libre tap,
   * attempt a one-shot read, POST the value through the host's
   * authenticated sync path (the host attaches the bearer). Other
   * platforms reject with an error.
   */
  readLibreOnce?(args: {
    patientId: string;
    timeoutMs?: number;
  }): Promise<LibreReadResult>;

  /** Android-only: brief Dexcom G6 BLE foreground read. */
  readDexcomG6Once?(args: {
    patientId: string;
    transmitterId: string;
    timeoutMs?: number;
  }): Promise<DexcomReadResult>;

  /** Android-only, partial: G7 pairing stops at the J-PAKE cert wall. */
  readDexcomG7Once?(args: {
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
  sync?: GlucoseSyncResult;
  syncError?: string;
}

/**
 * True when a native shell has injected `window.DragonflyBridge` and it
 * exposes the methods the adapter contract requires. Used at runtime by
 * `getBridge()` to dispatch to the right adapter.
 */
export function isNativeBridgePresent(win: Window = window): boolean {
  const host = win.DragonflyBridge;
  if (!host) return false;
  return (
    typeof host.installToken === "function" &&
    typeof host.clearToken === "function" &&
    typeof host.getStatus === "function" &&
    typeof host.emitDemoReading === "function"
  );
}

/**
 * Thin BridgeAdapter that delegates to the host-injected
 * `window.DragonflyBridge`. All persistence, network, and token storage
 * happen in the native shell — this file owns no state.
 */
export class NativeBridgeAdapter implements BridgeAdapter {
  readonly label: string;
  private readonly host: NativeBridgeHost;

  constructor(host: NativeBridgeHost) {
    this.host = host;
    this.label = host.label || "Native bridge";
  }

  async installToken(token: string): Promise<void> {
    if (!token.trim()) throw new Error("Token must not be empty");
    await this.host.installToken(token.trim());
  }

  async clearToken(): Promise<void> {
    await this.host.clearToken();
  }

  async getStatus(): Promise<BridgeStatus> {
    return this.host.getStatus();
  }

  async emitDemoReading(args: {
    patientId: string;
    valueMgDl: number;
  }): Promise<GlucoseSyncResult> {
    return this.host.emitDemoReading(args);
  }

  /** True when the host advertises Android-style NFC tap-read. */
  supportsLibreNfc(): boolean {
    return typeof this.host.readLibreOnce === "function";
  }

  /** True when the host advertises Dexcom G6 BLE read. */
  supportsDexcomG6(): boolean {
    return typeof this.host.readDexcomG6Once === "function";
  }

  /** True when the host advertises Dexcom G7 BLE read (partial). */
  supportsDexcomG7(): boolean {
    return typeof this.host.readDexcomG7Once === "function";
  }

  async readLibreOnce(args: {
    patientId: string;
    timeoutMs?: number;
  }): Promise<LibreReadResult> {
    if (!this.host.readLibreOnce) {
      throw new Error("Libre NFC read is not available on this host");
    }
    return this.host.readLibreOnce(args);
  }

  async readDexcomG6Once(args: {
    patientId: string;
    transmitterId: string;
    timeoutMs?: number;
  }): Promise<DexcomReadResult> {
    if (!this.host.readDexcomG6Once) {
      throw new Error("Dexcom G6 BLE read is not available on this host");
    }
    return this.host.readDexcomG6Once(args);
  }

  async readDexcomG7Once(args: {
    patientId: string;
    transmitterIdSuffix: string;
    certJwt?: string;
    timeoutMs?: number;
  }): Promise<DexcomG7ReadResult> {
    if (!this.host.readDexcomG7Once) {
      throw new Error("Dexcom G7 BLE read is not available on this host");
    }
    return this.host.readDexcomG7Once(args);
  }
}
