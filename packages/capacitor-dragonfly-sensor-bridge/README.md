# `@dragonfly/capacitor-sensor-bridge`

Capacitor plugin that satisfies the four-method `BridgeAdapter` contract
from `apps/patient-pwa/src/bridge/types.ts`. Used by `apps/patient-shell`,
the iOS / Android wrapper around the patient PWA.

This plugin owns:

- **Token storage** — iOS Keychain (`kSecClass: GenericPassword`,
  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) and
  Android `EncryptedSharedPreferences` (AES-256-GCM, master key in the
  Keystore). The WebView never sees the raw token after install.
- **Patient binding** — the `patientId` the token was first used for
  is pinned alongside; later `emitDemoReading` calls with a different
  `patientId` are refused locally as a cheap first line. The Worker
  enforces the same rule server-side.
- **Sync request** — the plugin makes the
  `POST /api/glucose/sync` HTTP call itself, attaches the bearer, and
  honestly tags the synthetic reading
  (`vendor: "unknown"`, `deviceName: "Dragonfly Demo Bridge"`,
  `source: "manual"`).

The first slice of **Libre NFC tap-reading on Android** is in
`android/.../LibreNfcReader.kt` — Libre 1 fully implemented (FRAM
read + latest-trend parse); Libre 2 Gen1 detected with decryption
deferred; Libre 2 Gen2 / Libre 3 / Libre 3 Plus detected and reported
unsupported. The plugin exposes `readLibreOnce()` which wraps the
reader and POSTs through `/api/glucose/sync`. **Untested on real
hardware in this commit** — see `docs/V1_5_PLAN.md` "Step 2 —
partially in tree, untested on hardware" for the first-run checklist.

Dexcom adapters are not yet started. iOS NFC tap-reading is
explicitly deferred to V2+ (Apple `NFCTagReaderSession` + the
`com.apple.developer.nfc.readersession.formats` entitlement, neither
of which V1.5 takes on).

## Layout

```text
packages/capacitor-dragonfly-sensor-bridge/
  package.json                  ← npm metadata (workspace package)
  DragonflySensorBridge.podspec ← iOS Pod metadata
  src/
    definitions.ts              ← TS plugin surface + types
    index.ts                    ← registerPlugin("DragonflySensorBridge")
    web.ts                      ← stub — web users go through WebBridgeAdapter
  ios/Plugin/
    DragonflySensorBridgePlugin.swift  ← Keychain + URLSession sync
    DragonflySensorBridgePlugin.m      ← CAP_PLUGIN registration
  android/
    build.gradle
    src/main/AndroidManifest.xml
    src/main/java/com/dragonfly/shell/sensorbridge/
      DragonflySensorBridgePlugin.kt   ← EncryptedSharedPreferences + HttpURLConnection sync
```

## API base URL

The plugin reads its `apiBase` from `capacitor.config.ts`:

```ts
plugins: {
  DragonflySensorBridge: {
    apiBase: "https://api.dragonfly.example.com",
  },
}
```

In dev with the Worker on the host machine, set this to the LAN IP your
device can reach (e.g. `http://192.168.1.42:8787`) — `localhost` is the
device's own loopback when the WebView runs on a phone or simulator.

## How the WebView reaches the plugin

1. The patient PWA loads inside the Capacitor WebView. Capacitor's runtime
   exposes registered plugins under `window.Capacitor.Plugins.<Name>`.
2. `apps/patient-pwa/public/dragonfly-shell-shim.js` runs before the React
   bundle and, when `window.Capacitor.Plugins.DragonflySensorBridge` is
   present, sets `window.DragonflyBridge` to a thin proxy.
3. The patient PWA's runtime dispatcher
   (`apps/patient-pwa/src/bridge/index.ts`) detects `window.DragonflyBridge`
   and selects `NativeBridgeAdapter` instead of `WebBridgeAdapter`.

In a regular browser, `window.Capacitor` is undefined, the shim no-ops,
and the dispatcher falls back to the web demo as before.

## Build

```bash
npm install                                  # workspaces install
npm run build --workspace=@dragonfly/capacitor-sensor-bridge
```

The Swift / Kotlin sources are pulled into the iOS / Android projects by
`npx cap sync` from the `apps/patient-shell` workspace — no separate
build is required. See `apps/patient-shell/README.md` for the end-to-end
flow.
