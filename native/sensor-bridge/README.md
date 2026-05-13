# Dragonfly Sensor Bridge

Native CGM ingestion layer for Dragonfly Cloud. The patient PWA cannot reach
Dexcom or Abbott Libre sensors directly with usable reliability — Web
Bluetooth and Web NFC are too narrow on iOS in particular. The bridge fills
that gap.

```text
[Sensor]  --BLE/NFC-->  [native bridge]  --HTTPS-->  [workers/api]
                              ^                            |
                              |                            v
                          [adapters]                  [shared schema]
                          dexcom.swift                packages/shared
                          libre.swift
```

The bridge is **not** part of the Cloudflare-native runtime. It is a
separately built mobile component that:

1. Pairs and connects with Dexcom and Libre sensors via the platform's BLE
   stack, and Libre 1/2-style sensors via NFC.
2. Normalizes vendor SDK / protocol output into the shared `GlucoseReading`
   shape declared in `packages/shared/src/types.ts`.
3. Buffers readings in a local sync queue when offline, and uploads batches
   to `POST /api/glucose/sync` on the Worker API.
4. Exposes a small local interface to the patient PWA. The contract
   the PWA codes against is the `BridgeAdapter` interface at
   `apps/patient-pwa/src/bridge/types.ts`. The PWA already ships
   `WebBridgeAdapter` (web demo simulator) and `NativeBridgeAdapter`
   (host-injected) against that contract. At runtime the PWA picks
   between them via `apps/patient-pwa/src/bridge/index.ts` —
   `NativeBridgeAdapter` wins when `window.DragonflyBridge` is
   present and exposes the required methods, otherwise the web demo
   adapter handles the page. See *"Web ↔ native contract"* below for
   exactly what an iOS / Android shell must implement.

## Layout

```text
native/sensor-bridge/
  README.md                           ← this file
  shared/
    PROTOCOL.md                       ← /api/glucose/sync wire contract
    ADAPTERS.md                       ← what every vendor adapter must do
  (see also: packages/capacitor-dragonfly-sensor-bridge/ — Capacitor
   plugin that satisfies the BridgeAdapter contract from the WebView side)
  (see also: apps/patient-shell/ — Capacitor project that hosts the PWA)
  ios/                                ← Swift package (see ios/README.md)
    DragonflySensorBridge/
      Package.swift
      Sources/DragonflySensorBridge/
        Bridge.swift                  ← orchestrates adapters + queue
        GlucoseEvent.swift            ← shared-schema mirror in Swift
        SensorAdapter.swift           ← protocol every adapter conforms to
        SyncClient.swift              ← talks to POST /api/glucose/sync
        SyncQueue.swift               ← offline buffer
        Adapters/
          DexcomAdapter.swift         ← BLE; stub
          LibreAdapter.swift          ← NFC + BLE; stub
      Tests/DragonflySensorBridgeTests/
  android/                            ← Gradle module (see android/README.md)
    sensor-bridge/
      build.gradle.kts
      src/main/AndroidManifest.xml
      src/main/kotlin/com/dragonfly/sensorbridge/
        Bridge.kt
        GlucoseEvent.kt
        SensorAdapter.kt
        SyncClient.kt
        SyncQueue.kt
        adapters/
          DexcomAdapter.kt
          LibreAdapter.kt
```

## Vendor isolation

`SensorAdapter` (Swift protocol / Kotlin interface) is the only thing the
`Bridge` knows about. Each vendor adapter:

- Implements pairing, scanning, and read callbacks.
- Owns vendor-specific quirks (Dexcom session windows, Libre activation
  countdowns, NFC tag protocols).
- Returns `GlucoseEvent` values normalized to mg/dL with an `IngestionPath`.

Do not let vendor SDK types leak past the adapter boundary.

## Implementation status

The orchestration layer is **real**:

- `Bridge`, `SyncClient`, `SyncQueue`, and the `SensorAdapter` boundary
  compile on both platforms.
- `SyncQueue` is **encrypted at rest** on both platforms:
  - iOS: JSON file in `.../Library/Caches/DragonflySensorBridge/sync-queue.json`
    written with `Data.WritingOptions.completeFileProtection` (AES per
    iOS file protection; key derived from device passcode and discarded
    when the device locks). The file is also flagged
    `isExcludedFromBackup`.
  - Android: `androidx.security.crypto.EncryptedFile` (AES-256-GCM with
    HKDF-4KB streaming) at
    `<filesDir>/dragonfly-sensor-bridge/sync-queue.bin`. The master key
    lives in the Android Keystore under
    `MasterKey.DEFAULT_MASTER_KEY_ALIAS`.
- `SyncClient` accepts a `bearerTokenProvider` and authenticates against
  `POST /api/glucose/sync` with a per-patient bridge token.
- The patient PWA ships a working **web demo bridge** that implements
  the same `BridgeAdapter` contract (in
  `apps/patient-pwa/src/bridge/`). It installs a token, shows status,
  and emits honestly-tagged synthetic readings (`Dragonfly Demo
  Bridge`, `source: manual`) through the authenticated sync path. This
  is the demo path used by [`docs/DEMO.md`](../../docs/DEMO.md).

Vendor adapters remain **stubbed**: `DexcomAdapter` and `LibreAdapter`
throw `notImplemented`. Real Dexcom / Libre native adapters are not
implemented yet. Current bridge support is limited to the web-demo
simulator and the native-shell-ready dispatch path documented below;
no direct device capture is claimed in this MVP. The architecture,
sync protocol, encryption-at-rest, and adapter boundary are in place
so vendor work can land without churning shared code.

## Why not pure web

- **Web Bluetooth** is unsupported on iOS Safari, the dominant browser for
  the pilot's elderly cohort.
- **Web NFC** is Chrome/Android-only, sandboxed, and won't reliably read
  Libre sensors.
- Vendor SDKs (Dexcom Mobile SDK, Abbott LibreLink) target native runtimes
  and require BAA-style agreements that don't fit a browser-only deployment.

## Web ↔ native contract

The patient PWA dispatches at runtime between the web demo and a native
shell. There is **no Capacitor plugin commitment** in this commit — the
contract is a plain JS object the shell installs on `window` before the
PWA's first paint. Capacitor, WKWebView's `evaluateJavaScript`, and
Android's `addJavascriptInterface` can all satisfy it.

The TypeScript surface a host must implement (see
`apps/patient-pwa/src/bridge/nativeBridge.ts`):

```ts
interface NativeBridgeHost {
  readonly label: string;                                     // e.g. "iOS native bridge 0.1.0"
  installToken(token: string): Promise<void> | void;
  clearToken():               Promise<void> | void;
  getStatus():                Promise<BridgeStatus> | BridgeStatus;
  emitDemoReading(args: { patientId: string; valueMgDl: number; }):
    Promise<GlucoseSyncResult>;
}

interface BridgeStatus {
  tokenInstalled: boolean;
  adapterLabel:   string;
  lastSyncedAt:   string | null;     // ISO 8601 or null
  pendingCount:   number;            // 0 if the host has no offline queue
}
```

The shell installs the object as `window.DragonflyBridge` before the PWA
loads. The PWA's `isNativeBridgePresent()` check confirms all four
methods are present and dispatches to `NativeBridgeAdapter`; if any are
missing it falls back to `WebBridgeAdapter`.

**Strict rules every shell follows:**

- `installToken` MUST persist the bearer token in the platform secure
  store (iOS Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
  Android Keystore-backed `EncryptedSharedPreferences`). The token MUST
  NOT be returned to the WebView again — `getStatus` only reports
  `tokenInstalled: true/false`.
- The shell attaches the bearer to outbound `POST /api/glucose/sync`
  requests itself. The WebView never holds the raw token after install.
- The shell enforces patient binding: it stores the token alongside the
  `patientId` it was issued for and refuses to use it for batches
  carrying any other `patientId`. The Worker enforces this server-side
  too, but the client check is the cheap first line.
- `emitDemoReading` MUST tag the synthetic reading honestly:
  `vendor: "unknown"`, `deviceName: "Dragonfly Demo Bridge"`,
  `source: "manual"`. Synthesizing readings as if they were real Dexcom
  or Libre output is a contract violation — and the Worker would reject
  them anyway because the bridge token is not authorised for that
  vendor stream until the real adapters land.
- `clearToken` MUST scrub the secure-store entry and any cached
  metadata. Sync-queue rows that reference the cleared patient should
  also be dropped.

A real Capacitor implementation lives at
[`packages/capacitor-dragonfly-sensor-bridge`](../../packages/capacitor-dragonfly-sensor-bridge),
hosted by the [`apps/patient-shell`](../../apps/patient-shell) Capacitor
project. That plugin stores the bearer in the iOS Keychain and Android
`EncryptedSharedPreferences`, owns the `POST /api/glucose/sync` request,
and refuses cross-patient writes locally. The `dragonfly-shell-shim.js`
in `apps/patient-pwa/public/` translates
`window.Capacitor.Plugins.DragonflySensorBridge` into the
`window.DragonflyBridge` shape on first paint.

Reference Capacitor-style JS stub (matches what the shim does):

```ts
import { Capacitor, registerPlugin } from "@capacitor/core";

const Bridge = registerPlugin<{
  installToken(opts: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
  getStatus(): Promise<BridgeStatus>;
  emitDemoReading(opts: { patientId: string; valueMgDl: number }):
    Promise<GlucoseSyncResult>;
}>("DragonflySensorBridge");

if (Capacitor.isNativePlatform()) {
  window.DragonflyBridge = {
    label: `Dragonfly bridge (${Capacitor.getPlatform()})`,
    installToken: (token) => Bridge.installToken({ token }),
    clearToken:   () => Bridge.clearToken(),
    getStatus:    () => Bridge.getStatus(),
    emitDemoReading: (args) => Bridge.emitDemoReading(args),
  };
}
```

The Swift / Kotlin sides forward each call to the existing
`Bridge`/`SyncClient`/`SyncQueue` types in `ios/` and `android/`. The
plain `addJavascriptInterface` and `WKScriptMessageHandler` shapes are
equivalent — the WebView side just needs the four methods exposed
under `window.DragonflyBridge`.

## Sync path

The bridge uploads batches to the Dragonfly Worker API:

```
POST {VITE_API_BASE_URL}/api/glucose/sync
Content-Type: application/json

{
  "patientId": "<dragonfly patient id>",
  "vendor": "dexcom" | "libre",
  "deviceName": "Dexcom G7",
  "bridgeVersion": "ios-0.1.0",
  "readings": [
    {
      "valueMgDl": 142,
      "context": "post_lunch_1_to_2h",
      "timestamp": "2026-05-08T14:32:00Z",
      "trend": "rising_slowly",
      "rawDeviceId": "G7-9F12",
      "readingKind": "sensor",
      "ingestionPath": "native-ble"
    }
  ]
}
```

The endpoint dedupes on `(patientId, rawDeviceId, timestamp)` and returns
`{ accepted, duplicates, rejected[] }`.

See `shared/PROTOCOL.md` for the authoritative contract.
