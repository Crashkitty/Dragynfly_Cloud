# Sync Protocol — `POST /api/glucose/sync`

The wire contract between the native sensor bridge and the Dragonfly
Worker API. The authoritative TypeScript shapes live in
`packages/shared/src/types.ts` (`GlucoseSyncBatch`, `NewGlucoseReading`,
`GlucoseSyncResult`); this document is a reference for the iOS and Android
implementations.

## Endpoint

```
POST {API_BASE}/api/glucose/sync
Content-Type: application/json
```

Authentication is intentionally not specified yet — the V1 deployment runs
behind Cloudflare Access for staff and uses a study-issued participant
token (TBD) for the bridge. Treat the bearer header as required but
opaque to the bridge: pass through whatever the patient app gave you.

## Request body

```jsonc
{
  "patientId": "9b1f3...",         // required — Dragonfly patient id
  "vendor": "dexcom" | "libre" | "unknown",  // required
  "deviceName": "Dexcom G7",       // optional — human-readable model
  "bridgeVersion": "ios-0.1.0",    // optional — bridge build identifier
  "readings": [                    // required, may be empty (no-op)
    {
      "valueMgDl": 142,            // required, 10..1000
      "context": "post_lunch_1_to_2h",  // required, one of the GLUCOSE_CONTEXTS
      "timestamp": "2026-05-08T14:32:00Z",  // optional, defaults to now
      "source": "cgm",             // optional — defaults to "cgm" for sync batches
      "vendor": "dexcom",          // optional — overrides batch vendor
      "deviceName": "Dexcom G7",   // optional — overrides batch deviceName
      "trend": "rising_slowly",    // optional — see GLUCOSE_TRENDS
      "rawDeviceId": "G7-9F12",    // optional — vendor-stable id; required for dedup
      "readingKind": "sensor",     // optional — "sensor" | "backfill" | "manual"
      "ingestionPath": "native-ble", // optional — "native-ble" | "native-nfc" | ...
      "notes": "...",              // optional
      "photoUrl": "https://..."    // optional
    }
  ]
}
```

## Response

```jsonc
// 200 OK
{
  "accepted":   3,                 // newly persisted
  "duplicates": 1,                 // matched existing (patientId, rawDeviceId, timestamp)
  "rejected": [
    { "index": 4, "reason": "valueMgDl out of plausible range" }
  ]
}
```

```jsonc
// 400 Bad Request
{ "error": "Invalid batch", "details": ["vendor must be one of dexcom|libre|unknown"] }
```

The endpoint never partial-fails: each reading is independently accepted,
deduped, or rejected. The bridge can drop readings whose index is reported
as `accepted` or `duplicates` from its local queue.

## Idempotency rules

- The server dedupes when both `rawDeviceId` and `timestamp` are present.
- If you omit either, the same reading uploaded twice will create two rows.
- Adapters MUST set `rawDeviceId` to a vendor-stable identifier that is
  unique per sample (e.g. Dexcom record id, Libre block hash + timestamp
  combination).

## Retry guidance

- Exponential backoff with jitter, max ~10 attempts per batch.
- Network errors and 5xx → retry.
- 4xx → drop the offending reading, log, do not retry the batch as-is.
- `accepted + duplicates + rejected.length === readings.length` always holds.

## Versioning

Bumps to the shape are reflected in `bridgeVersion`. Old bridges sending
unknown optional fields are accepted; unknown required fields cause 400.
