// Dragonfly native-shell shim.
//
// When the patient PWA is loaded inside the Capacitor shell at
// `apps/patient-shell`, the shell's runtime exposes
// `window.Capacitor.Plugins.DragonflySensorBridge` (see
// `packages/capacitor-dragonfly-sensor-bridge`). This script translates
// that into the `window.DragonflyBridge` shape the PWA's runtime
// dispatcher expects (`apps/patient-pwa/src/bridge/nativeBridge.ts`).
//
// In a regular browser session the script is a silent no-op:
// `window.Capacitor` is undefined, so the dispatcher falls back to
// the web demo adapter.
(function () {
  var cap = window.Capacitor;
  if (!cap || !cap.Plugins || !cap.Plugins.DragonflySensorBridge) return;
  var p = cap.Plugins.DragonflySensorBridge;
  var platform =
    (cap.getPlatform && cap.getPlatform()) ||
    (cap.platform || "native");
  window.DragonflyBridge = {
    label: "Dragonfly native shell (Capacitor / " + platform + ")",
    installToken: function (token) {
      return p.installToken({ token: token });
    },
    clearToken: function () {
      return p.clearToken();
    },
    getStatus: function () {
      return p.getStatus();
    },
    emitDemoReading: function (args) {
      return p.emitDemoReading({
        patientId: args.patientId,
        valueMgDl: args.valueMgDl,
      });
    },
    // Android-only at present. Web / iOS shells will reject with
    // `Unimplemented` from the plugin — the BridgeAdapter contract on
    // the PWA side checks `bridgeCapabilities()` before exposing the
    // button, so we don't show an action that can never succeed.
    readLibreOnce: function (args) {
      if (typeof p.readLibreOnce !== "function") {
        return Promise.reject(new Error("readLibreOnce not available on this platform"));
      }
      return p.readLibreOnce({
        patientId: args.patientId,
        timeoutMs: args.timeoutMs,
      });
    },
    readDexcomG6Once: function (args) {
      if (typeof p.readDexcomG6Once !== "function") {
        return Promise.reject(new Error("readDexcomG6Once not available on this platform"));
      }
      return p.readDexcomG6Once({
        patientId: args.patientId,
        transmitterId: args.transmitterId,
        timeoutMs: args.timeoutMs,
      });
    },
    readDexcomG7Once: function (args) {
      if (typeof p.readDexcomG7Once !== "function") {
        return Promise.reject(new Error("readDexcomG7Once not available on this platform"));
      }
      return p.readDexcomG7Once({
        patientId: args.patientId,
        transmitterIdSuffix: args.transmitterIdSuffix,
        certJwt: args.certJwt,
        timeoutMs: args.timeoutMs,
      });
    },
    platform: platform,
  };
})();
