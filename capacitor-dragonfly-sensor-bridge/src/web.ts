import { WebPlugin } from "@capacitor/core";

import type {
  BridgeStatus,
  DexcomG7ReadResult,
  DexcomReadResult,
  DragonflySensorBridgePlugin,
  GlucoseSyncResult,
  LibreReadResult,
} from "./definitions.js";

// The web fallback is intentionally inert: the patient PWA already ships
// `WebBridgeAdapter` in `apps/patient-pwa/src/bridge/webBridge.ts`, and
// the runtime dispatcher prefers it whenever `window.DragonflyBridge`
// is not the native one. If somebody loads this plugin in a regular
// browser they almost certainly meant to use the demo simulator
// instead — we surface that with `Unimplemented`.
export class DragonflySensorBridgeWeb
  extends WebPlugin
  implements DragonflySensorBridgePlugin
{
  async installToken(): Promise<void> {
    throw this.unavailable(
      "Use the WebBridgeAdapter from apps/patient-pwa/src/bridge/webBridge.ts on the web — this plugin is for the Capacitor shell only.",
    );
  }

  async clearToken(): Promise<void> {
    throw this.unavailable("not available on web");
  }

  async getStatus(): Promise<BridgeStatus> {
    throw this.unavailable("not available on web");
  }

  async emitDemoReading(): Promise<GlucoseSyncResult> {
    throw this.unavailable("not available on web");
  }

  async readLibreOnce(): Promise<LibreReadResult> {
    throw this.unavailable(
      "Libre NFC tap-reading is only available in the Android Capacitor shell. " +
        "The web demo flow uses the manual-entry path.",
    );
  }

  async readDexcomG6Once(): Promise<DexcomReadResult> {
    throw this.unavailable("Dexcom G6 BLE is only available in the Android Capacitor shell.");
  }

  async readDexcomG7Once(): Promise<DexcomG7ReadResult> {
    throw this.unavailable("Dexcom G7 BLE is only available in the Android Capacitor shell.");
  }
}
