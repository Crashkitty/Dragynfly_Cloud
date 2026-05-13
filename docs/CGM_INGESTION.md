# CGM Ingestion — Hybrid, Privacy-First Architecture

Dragonfly Cloud is **PWA-first** for UI, **native-first** for CGM
device IO, and **self-contained** end to end. Pure Web Bluetooth and
Web NFC do not give us the reliability or the iOS coverage the pilot
needs, and Dexcom/Abbott vendor SDKs target native runtimes anyway.

The primary trusted data path is:

```text
sensor → native bridge → Dragonfly Worker API → Dragonfly storage → Dragonfly UI
```

No third-party diabetes platform sits inside that arrow. Specifically
banned from the primary path: **Dexcom Share / developer cloud, Abbott
LibreView / LibreLink Up, Nightscout, Tidepool, HealthKit, and Health
Connect.** Those exist in the schema as deferred interoperability values
only — see "Deferred opt-in interop" below and `docs/PRIVACY.md`.

```text
┌─────────────────────────────┐    BLE / NFC    ┌──────────────┐
│  native/sensor-bridge       │ ◄──────────────► │ Dexcom/Libre │
│   ┌───────────────────┐     │                  │   sensor     │
│   │ DexcomAdapter     │     │                  └──────────────┘
│   │ LibreAdapter      │     │
│   └────────┬──────────┘     │
│            ▼                │
│   normalize → GlucoseEvent  │
│   SyncQueue (offline buffer)│
└────────────┬────────────────┘
             │ HTTPS
             ▼
┌─────────────────────────────┐
│  workers/api                │
│   POST /api/glucose/sync    │  dedup by (rawDeviceId, timestamp)
│   POST /api/glucose         │  manual / fallback path
└────────────┬────────────────┘
             ▼
        Repo (Memory or future Mongo)
             ▲
┌─────────────────────────────┐
│  apps/patient-pwa           │  manual entry, dashboard, history
│  apps/provider-web          │  trend chart, queue, tasks
└─────────────────────────────┘
```

## Three runtimes, one schema

| Runtime | Owns | Examples |
|---|---|---|
| Cloudflare Workers (`workers/api`) | Validated HTTP, repository, dedup | Hono routes, MemoryRepo |
| Native bridge (`native/sensor-bridge`) | BLE/NFC pairing, vendor SDK, sync queue | iOS `DragonflySensorBridge`, Android `:sensor-bridge` |
| Vite PWA (`apps/patient-pwa`) | Manual entry, history, telemed entry | Login, Dashboard, LogGlucose |

`packages/shared/src/types.ts` is the single source of truth for the
`GlucoseReading` shape. The Swift `GlucoseEvent.swift` and Kotlin
`GlucoseEvent.kt` mirror it deliberately — when the TS shape changes, the
mirrors must change too.

## Normalized reading shape

Every reading reaching the API matches `NewGlucoseReading`:

```ts
{
  patientId: string
  valueMgDl: number                              // always mg/dL
  source: "cgm" | "manual" | "lancet"
  vendor?: "dexcom" | "libre" | "unknown"
  deviceName?: string
  context: GlucoseContext                        // pre_taiyi … end_of_day
  timestamp?: string                             // ISO-8601, defaults now
  notes?: string
  photoUrl?: string
  trend?: GlucoseTrend                           // 8-bucket
  rawDeviceId?: string                           // dedup key
  readingKind?: "sensor" | "backfill" | "manual"
  ingestionPath?: "native-ble" | "native-nfc"
                | "healthkit" | "health-connect" | "manual"
}
```

The bridge sets `source: "cgm"` and an explicit `vendor` and
`ingestionPath`. The PWA's manual entry sets `source: "manual"` (or
`"lancet"`) and `ingestionPath: "manual"` — manual entry remains the
**always-on fallback** when the bridge is offline, sensors are out of
reach, or vendor agreements are pending.

## Sync endpoint

`POST /api/glucose/sync` accepts a batch from the bridge:

```bash
curl -X POST http://localhost:8787/api/glucose/sync \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "<id>",
    "vendor": "dexcom",
    "deviceName": "Dexcom G7",
    "bridgeVersion": "ios-0.1.0",
    "readings": [{
      "valueMgDl": 142,
      "context": "post_lunch_1_to_2h",
      "timestamp": "2026-05-08T14:32:00Z",
      "trend": "rising_slowly",
      "rawDeviceId": "G7-9F12",
      "readingKind": "sensor",
      "ingestionPath": "native-ble"
    }]
  }'
```

Returns `{ accepted, duplicates, rejected[] }`. The endpoint dedupes on
`(patientId, rawDeviceId, timestamp)` so the bridge can replay batches
on flaky networks without producing duplicate rows.

Wire-level details: `native/sensor-bridge/shared/PROTOCOL.md`.

## Vendor adapter contract

`SensorAdapter` (Swift protocol / Kotlin interface) is the only thing
the `Bridge` knows about. Each vendor adapter must:

1. Convert vendor units to mg/dL.
2. Preserve original sample timestamps.
3. Map vendor trend codes onto the 8-bucket `GlucoseTrend`.
4. Emit a stable `rawDeviceId` per sample.
5. Set `ingestionPath` to `native-ble` or `native-nfc`.

Adapter rules: `native/sensor-bridge/shared/ADAPTERS.md`.

## What is real vs stubbed

| Piece | Status |
|---|---|
| Shared schema (`vendor`, `trend`, `rawDeviceId`, `readingKind`, `ingestionPath`) | Real |
| `POST /api/glucose/sync` with idempotent insert | Real |
| D1 dedup on `(patientId, rawDeviceId, timestamp)` (partial unique index) | Real |
| `/api/glucose/sync` bearer auth pinned to a patientId | Real |
| iOS Swift Package: Bridge, SyncClient, SyncQueue, adapter protocol | Real (compiles) |
| Android Gradle module: Bridge, SyncClient, SyncQueue, adapter interface | Real (compiles) |
| Dexcom adapter (BLE) | Stub — `notImplemented` until partner agreement |
| Libre adapter (NFC + BLE) | Stub — `notImplemented` until partner agreement |
| Persistent SyncQueue, encrypted at rest | Real — iOS `.completeFileProtection`, Android `EncryptedFile` (AES-256-GCM, key in Android Keystore) |
| Bridge → patient-PWA local interface | **Real for the web demo** via the `BridgeAdapter` contract in `apps/patient-pwa/src/bridge/types.ts` and `WebBridgeAdapter` (`webBridge.ts`). The PWA's `/bridge` screen installs a token, shows status, and emits honestly-tagged synthetic readings through the same auth path a native bridge will use. A Capacitor plugin / WKWebView bridge that implements the same `BridgeAdapter` against `native/sensor-bridge/` is the next step |
| HealthKit / Health Connect import | Modeled as deferred `ingestionPath` values; **not** wired up |
| Vendor cloud relays (Dexcom Share, LibreView, Nightscout, Tidepool) | **Out of scope** for the primary path |
| Auth token between bridge and Worker API | Deferred — provider-supplied bearer |

## Deferred opt-in interop

The shared schema admits ingestion-path values the V1 stack does not
exercise:

- `ingestionPath: "healthkit"` (iOS Health) and `"health-connect"`
  (Android Health Connect) — V2 opt-in, off by default, gated on
  participant consent.
- Vendor cloud relays (Dexcom Share, LibreView, Nightscout, Tidepool)
  are **not** in the schema as ingestion paths and will not be added to
  the primary path. If the study later authorizes cloud-mediated
  retrospective import for the PI dashboard, that work lives in a
  separate, opt-in interop worker — not in the bridge or in
  `/api/glucose/sync`.

V1 is self-contained. Trust boundaries are documented in
[`PRIVACY.md`](PRIVACY.md).

## Implementation priority

This matches the user-stated order:

1. ✅ Cloudflare-native PWA + Worker API
2. ✅ Shared schemas/types
3. ✅ Native sensor bridge scaffold (iOS + Android)
4. ✅ Adapter boundaries for Dexcom and Libre
5. ✅ Sync path from bridge to Worker API (`/api/glucose/sync`)
6. ✅ Manual glucose entry remains the fallback path in the PWA

## Honesty

Dragonfly does **not** claim full CGM support yet. The architecture
around direct device integration is in place; vendor-specific BLE/NFC
work is gated on Dexcom and Abbott agreements and on user-provided
credentials. Manual entry covers the pilot's daily-checkin needs in the
meantime.

Marketing language: "privacy-first MVP", "clinical research workflow
scaffold", "designed with healthcare security requirements in mind".
**Not** "HIPAA-compliant", "secure and compliant", or "production-ready
healthcare platform".
