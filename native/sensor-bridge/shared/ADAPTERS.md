# Vendor adapter contract

Every CGM vendor adapter (Dexcom, Libre, future vendors) must implement
the same boundary so the `Bridge` orchestrator stays vendor-agnostic.

## Lifecycle

```
discover()  → list nearby/known sensors (BLE scan, NFC tap prompt)
pair(id)    → bind to a specific sensor / activate a session
start()     → begin streaming readings (or scheduling NFC reads)
stop()      → release sensor, end session
```

## Reading callback

Each adapter emits normalized `GlucoseEvent`s to a single sink owned by
the `Bridge`. The event shape mirrors `NewGlucoseReading` from
`packages/shared/src/types.ts`:

```text
GlucoseEvent
  valueMgDl: Double         (mandatory)
  timestamp: Date           (mandatory, sensor-side wall clock)
  trend: GlucoseTrend?      (vendor-dependent)
  rawDeviceId: String?      (vendor-stable per-sample id; sets dedup key)
  readingKind: ReadingKind  ("sensor" | "backfill" | "manual")
  ingestionPath: IngestionPath  (vendor must set "native-ble" / "native-nfc")
```

Adapters must:

1. Convert vendor units to mg/dL. (Libre EU often reports mmol/L —
   multiply by 18.0182 and round to one decimal.)
2. Preserve original sample timestamps. Do not stamp "now".
3. Map vendor trend codes to the eight `GlucoseTrend` values (see
   `packages/shared/src/constants.ts`). Unknown → `"unknown"`.
4. Emit a stable `rawDeviceId` per sample. Without it the API cannot
   dedupe replayed batches.

## What adapters must NOT do

- Talk to the Dragonfly Worker API directly. The `SyncClient` owns that.
- Mutate `SyncQueue` state. Hand events to `Bridge` and let it queue.
- Leak vendor SDK types past their own file. Importing
  `DexcomShareClient` types into `Bridge.swift` is a bug.
- Cache PHI on disk. The adapter is a pipe; persistence is `SyncQueue`'s
  job and uses platform-secure storage (Keychain on iOS, EncryptedSharedPreferences
  on Android).

## Pairing/auth concerns

| Vendor | Mechanism | Notes |
|---|---|---|
| Dexcom G6/G7 | BLE + Dexcom Authority partner credentials | Requires partner agreement; out of scope for V1 scaffold |
| Abbott Libre 2 | NFC activation + BLE streaming | LibreLink license required; out of scope for V1 scaffold |
| Abbott Libre 1 | NFC tap-on-demand only | NFC adapter must surface "tap to scan" UX upstream |

The scaffold ships interface-only. Real device IO is gated on those
agreements and on user-provided credentials.
