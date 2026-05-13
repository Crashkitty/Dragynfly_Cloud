# V1.5 — Android-first CGM ingestion

V1 is locked and shipping per [`MVP_SCOPE.md`](MVP_SCOPE.md): patient
PWA + provider dashboard + telemed + audit, no CGM, web-only. V1.5
adds real CGM ingestion **on Android**.

iOS BLE-direct CGM is deferred to **V2+**, contingent on Apple
granting the `com.apple.developer.bluetooth-central-background`
private entitlement (a vendor-style application process with no
guaranteed outcome). iOS participants in V1.5 stay on the V1 path:
PWA + manual entry + telemed.

## Scope — minimum viable, by design

> **One glucose value per user-initiated event, into our API.** Nothing
> else. No backfill, no trend-arrow math, no continuous streaming, no
> session-state machine, no in-app history graphs duplicating what the
> dashboard already shows. The patient PWA's existing screens are the
> UI; the sensor work only contributes a `valueMgDl` and a timestamp
> through the existing `POST /api/glucose/sync` path.

That narrows the technical pattern materially:

- **Libre (1 / 2 Gen1) → NFC tap on demand.** Phone-to-sensor tap reads
  the FRAM; we extract the most recent reading and POST it. No BLE
  pairing, no foreground service, no continuous connection — none of
  the Apple-entitlement-style background-BLE problems even on iOS
  later. The user taps when they want a reading.
- **Dexcom (G6 / G7) → brief foreground BLE read.** When the user
  opens the bridge screen, we connect, wait for the next 5-minute
  reading notification (worst case ~5 minutes wait), disconnect.
  No persistent service. No background entitlement needed because
  the phone is in the user's hand during the read.

The architecture in V1 already supports this pattern: the bearer
token lives in `EncryptedSharedPreferences`, the Capacitor plugin
already owns `POST /api/glucose/sync`, and the patient PWA's
existing manual-entry path can be invoked from native after the
NFC/BLE read completes. We're filling in one method per vendor, not
building a CGM platform.

## Why Android-first

The evidence is consistent. Every open-source implementation that
*actually reads a current-generation CGM today* runs on Android:
xDrip+, Juggluco, the various G7 community apps. Every iOS attempt
hits one of two walls: incomplete reverse-engineering for current
sensors (Libre 3 / Libre 2 Gen2 / Dexcom G7) **or** Apple's
restricted BLE-background entitlement, often both. Android has
neither: foreground services hold GATT connections indefinitely;
foreground service notification is acceptable to participants; no
Apple in the loop.

## Cohort question — needs a human decision (Dr. Alana / IRB)

V1.5 ingestion strategy depends on a study-design call we have not
made yet. The three workable shapes:

| Cohort shape | Notes | Decision risks |
|---|---|---|
| **A. Android-only CGM arm** | Enroll only Android-owning participants into the CGM arm; iOS participants stay on V1 manual-entry. | Mixed-data-fidelity arms — needs biostatistician sign-off. CGM arm size capped at Android share of the cohort (probably 40-50% of elderly San Francisco T2D participants). |
| **B. Study-provisioned Android phones** | Pixel 7a or similar; $400-500/unit; n=20-40 ⇒ $8-20k hardware budget. All CGM participants use a study phone. | Elderly participants on an unfamiliar phone — training session, larger fonts, coordinator backup. Phone return / data wipe procedures need writing. |
| **C. CGM as protocol-secondary** | Keep CGM optional; primary endpoint is HbA1c + finger-stick + symptom self-report (the historical T2D trial standard). CGM data enriches secondary endpoints for whichever participants happen to have Android. | Easiest IRB story; lowest CGM N for analysis. The pilot's *scientific* posture stays the same as today. |

Recommendation pending the call: **C if the primary endpoint can be
answered without CGM** (which historically it can); **B if CGM is the
primary outcome variable**; **A only as fallback if B's budget is
unavailable** — A creates a heterogeneous-platform study population
which is the hardest design to defend.

This document does not pick the cohort shape. It picks the
*technical* direction — Android-first — for whichever cohort design
lands.

## Sensor targets — honest state

What we'd actually be able to ship on Android, per the current
open-source landscape:

| Sensor | Android RE state | What V1.5 can ship |
|---|---|---|
| **Dexcom G6** | Solid. xDrip+ supports it cleanly. Older transmitters but still in distribution. | **Yes** — first target. |
| **Dexcom G7** | xDrip+ supports it. Requires user-supplied JWT certificate (QR-scanned in xDrip+) for J-PAKE pairing. Not pretty UX. Active community work. | **Yes, with caveats.** Document the QR-cert step in the patient enrollment flow. |
| **Libre 1** | Long-supported by Juggluco, xDrip+, LibreLink etc. Increasingly phased out at pharmacies. | **Yes**, if participants happen to have one. |
| **Libre 2 Gen1 (EU/US first-gen)** | Working in Juggluco / xDrip+. Distinguishable from Gen2 by `patchInfo`. | **Yes** — second target. |
| **Libre 2 Gen2 (current production)** | **No clean open-source implementation.** Per DiaBLE's gui-dos: `p1()` / `p2()` security functions aren't reverse-engineered at all; Juggluco uses Abbott binary blobs nobody can decompile. | **Deferred within V1.5.** Watch the community; revisit when someone publishes p1/p2. |
| **Libre 3 / Libre 3 Plus** | Pairing works (Juggluco). Full data path depends on the same native binary blobs. | **Deferred within V1.5.** |
| **Dexcom G5 and older** | Out of distribution; ignore. | No. |

So the realistic V1.5 sensor list is: **Dexcom G6, Dexcom G7 (with
QR-cert), Libre 1, Libre 2 Gen1.** Two vendors, four SKUs. That
covers most participants whose sensors were prescribed pre-2024 and
some current ones. It does not cover Libre 2 Gen2 / Libre 3 / Libre 3
Plus, which are what pharmacies are increasingly stocking new. The
cohort-design conversation needs to know that.

## References inventory & license posture

| Project | License | Useful for | How we use it |
|---|---|---|---|
| [xDrip+](https://github.com/NightscoutFoundation/xDrip) | GPLv3 | Dexcom G6/G7 + Libre on Android, treatment of certificate handoff, sync queue patterns | **Reference only.** Document behaviour, reimplement clean-room. GPL source must not be copied into Dragonfly. |
| [Juggluco](https://github.com/j-kaltes/Juggluco) | GPLv3 | Libre 1/2 BLE+NFC flows on Android | **Reference only.** Same posture. Native C blobs they rely on for Libre 2 Gen2 / Libre 3 are not reimplementable from their source — that work is upstream-blocked. |
| [DiaBLE](https://github.com/gui-dos/DiaBLE) | MIT | Protocol-level notes — BLE characteristic IDs, command opcodes, packet structures, NFC tag protocols, pairing sequences | **Citable / linkable.** Use as documentation for the protocol layer; the iOS implementation itself isn't relevant to Android. |
| [dexpy](https://github.com/winemug/dexpy) | None | USB-tethered receiver tunneling — not direct BLE | Wrong architecture for our case. Skip. |

**Dragonfly's own license is not yet set.** Until it is, the safest
posture is: write clean-room Kotlin code in
`packages/capacitor-dragonfly-sensor-bridge/android/` and
`native/sensor-bridge/android/`, document references in commit
messages and per-file headers, do not copy GPL source. If the
Dragonfly project later picks GPL itself, linking against
xDrip+/Juggluco source becomes possible — but the architectural cost
of that license choice on the rest of the Workers/PWA codebase is its
own conversation.

## Architecture — already in place

V1.5 plugs into the existing slots without architectural change:

```
[Android phone]
  Capacitor shell (apps/patient-shell)
    Patient PWA (apps/patient-pwa) — same web bundle
      window.DragonflyBridge — set by dragonfly-shell-shim.js
        ↓
      Capacitor plugin (packages/capacitor-dragonfly-sensor-bridge/android)
        ↓ (new code — Kotlin, foreground service)
      Android sensor-bridge orchestration (native/sensor-bridge/android)
        — Bridge.kt, SyncClient.kt, SyncQueue.kt already exist
        — adapters/DexcomAdapter.kt and LibreAdapter.kt are stubs to fill in
        ↓
      POST /api/glucose/sync on workers/api (unchanged)
        ↓
      D1 storage + provider dashboard refresh
```

What's already there: the BridgeAdapter contract, the Capacitor
plugin scaffold, the Android sensor-bridge Gradle module, the
encrypted-at-rest sync queue, the Worker's idempotent
`POST /api/glucose/sync`. What's new: actual BLE+NFC vendor adapter
implementations in `native/sensor-bridge/android/sensor-bridge/.../adapters/`.

## Implementation order

Reordered around the narrower "one reading per user event" scope:

1. **Capacitor shell smoke on a real Android device.** No CGM yet —
   verify `window.DragonflyBridge` reaches the Kotlin plugin, token
   install lands in `EncryptedSharedPreferences`, demo reading
   round-trips through `/api/glucose/sync`. Boring problems (network
   reachability from emulator, signing, manifest merge) sorted
   before any vendor code.
2. **Libre NFC tap, Libre 1 only.** `LibreNfcReader.kt` enables
   `NfcAdapter.ReaderMode`, transceives `0xA1 0x07` to get
   `patchInfo`, detects sensor generation. For Libre 1 only (FRAM is
   unencrypted) reads the latest reading block, emits one
   `GlucoseEvent`. Simplest possible end-to-end.
3. **Libre 2 Gen1 decryption.** FRAM read same as step 2; add the
   UID-derived XOR-stream decryption (well documented in DiaBLE's
   Swift and Juggluco's Kotlin — clean-room port). Libre 2 Gen1
   detection by patchInfo before invoking decryption.
4. **Dexcom G6 — brief foreground BLE read.** Single-shot:
   user opens bridge screen → connect to transmitter → wait for
   next reading notification → emit + disconnect. No persistent
   service.
5. **Dexcom G7.** Same as G6 with J-PAKE handshake + JWT cert
   handoff. The handoff UX mirrors the existing bridge-token
   provisioning: coordinator generates cert per-participant, hands
   off out-of-band, participant scans/pastes in.
6. **Operational hardening.** Detect-but-don't-decrypt fallback for
   Libre 2 Gen2 / Libre 3 / Libre 3 Plus (so participants whose
   sensors aren't supported get an honest error, not a silent
   failure). Audit a `glucose.sync.sensor_unsupported` event so
   coordinators know.

Each step is a separate PR; each one ends with a smoke test against
a real sensor before the next starts. No grand "rewrite everything"
landing.

## Non-goals for V1.5

- **iOS direct-BLE.** Stays deferred. The Capacitor shell's iOS side
  keeps the existing Keychain plugin as scaffold; no real BLE
  adapter ships for iOS until Apple grants the entitlement.
- **Libre 2 Gen2 / Libre 3 / Libre 3 Plus.** Open-source work
  upstream is blocked on `p1/p2` and native crypto blobs. We watch;
  we don't lead this RE.
- **Vendor partner SDK paths.** A separate decision; if a vendor
  partnership lands, it preempts much of this plan but doesn't break
  the architecture.
- **HealthKit / Health Connect.** Out of scope; opt-in
  interoperability paths only, behind explicit per-participant
  consent, V2+.
- **AI summaries, BASTION integration.** Still V1.5-deferred.
- **No regulatory submission.** This is a pilot scaffold, not a
  cleared medical device.

## What V1.5 explicitly does NOT change in V1

- The patient PWA's V1 surfaces — login, dashboard, glucose log,
  food diary, telemed, profile, audit — remain identical for
  participants who stay on the manual-entry path.
- The staff trust path, audit log, signed-R2 uploads, telemed flow
  are unchanged.
- `VITE_FEATURE_BRIDGE=false` remains the V1 default. V1.5 builds
  for Android-cohort participants set it true.

## Open questions before any code lands

1. **Cohort shape** — A / B / C above. Dr. Alana + biostatistician
   call.
2. **License direction for Dragonfly itself.** Affects whether
   linking GPL references is on the table.
3. **Dexcom G7 enrollment UX** — the JWT certificate handoff is
   currently a QR scan in xDrip+. We need a coordinator-side way to
   provision that cert per-participant. Out-of-band hand-off mirrors
   the existing bridge-token flow.
4. **Vendor BAA decision.** Even with DIY adapters, real PHI
   ingestion needs the privacy / compliance review per
   `docs/PRIVACY.md`. Read xDrip+'s disclaimer for the posture other
   projects take; Dragonfly's clinical context is stricter.
5. **Firmware churn ops.** xDrip+'s history is full of "Libre
   firmware X broke things" cycles. Need a plan for that *before*
   the pilot is mid-flight, not after.

## What's in tree today — untested on hardware

Steps 2–5 are now structurally in the codebase behind the existing
`VITE_FEATURE_BRIDGE` flag. Honest state per sensor:

| Sensor | Code state | Hardware-verified |
|---|---|---|
| Libre 1 (NFC) | Full path: scan → patchInfo classify → FRAM read → trend parse → mg/dL → POST | ❌ |
| Libre 2 Gen1 (NFC) | Plumbing + cipher *shape* written. `libre2Gen1DecryptVerified = false` flag gates use; method returns "captured FRAM, decrypt unverified" until a real-sensor test vector confirms `libreKeyStream` constants | ❌ |
| Libre 2 Gen2 / Libre 3 / Libre 3 Plus / Pro | Detected from patchInfo, reported as unsupported | n/a |
| Dexcom G6 (BLE) | Full path: scan → connect → AES-challenge auth keyed off transmitter ID → subscribe to control char → parse GlucoseRx 0x4F → POST | ❌ |
| Dexcom G7 (BLE) | BLE wire + pairing sequence stages 0A 00 / 0A 01 / 0A 02; stops cleanly at `STAGE_PAIRING_NEEDS_CERT` with a UI message. No J-PAKE integration yet. | ❌ for the pair-up; J-PAKE itself blocked on cert provisioning |

Files added/changed in this slice:

- `packages/capacitor-dragonfly-sensor-bridge/android/src/main/AndroidManifest.xml`
  — NFC + BLE_SCAN + BLE_CONNECT permissions (with API 31+ semantics
  and pre-31 location fallback).
- `…/LibreNfcReader.kt` — Libre 1 implemented; Libre 2 Gen1 plumbed
  with `libre2Gen1DecryptVerified` opt-in flag and explicit
  documented uncertainty in `libreKeyStream`.
- `…/DexcomG6BleReader.kt` *(new)* — clean-room G6 BLE flow.
  Service `F8083532-…`, AuthChar `F8083535-…`, ControlChar
  `F8083533-…`, AES-ECB with key = `"00" + transmitterId + "00"`.
- `…/DexcomG7BleReader.kt` *(new)* — G7 pairing wire with documented
  40-line sequence reproduced in `documentedPairingSequence` for
  reference. Stops at J-PAKE.
- `…/DragonflySensorBridgePlugin.kt` — three new plugin methods:
  `readLibreOnce`, `readDexcomG6Once`, `readDexcomG7Once`. All POST
  through `/api/glucose/sync` with correct vendor/ingestionPath tags
  when a reading is extracted.
- iOS side — `unimplemented` for all three new methods (V2+).
- Patient PWA — `BridgeAdapter` contract extended; capability probes
  `supportsLibreNfc()` / `supportsDexcomG6()` / `supportsDexcomG7()`;
  three new cards on the Bridge screen, each only rendered when the
  host advertises the capability.

### Realistic first-run checklist (per sensor type)

**Libre 1:**
- Confirm scan finds a tag; `tag.id` byte order vs published UID.
- Verify `mg/dL = raw / 8.5` against a finger-stick paired reading.

**Libre 2 Gen1 (when you sit down with a sensor):**
1. Read an encrypted FRAM dump via `readLibreOnce` (output today
   surfaces the captured bytes).
2. Get a paired plaintext dump from xDrip+/Juggluco of the same sensor.
3. Verify `libreKeyStream` produces the right keystream for
   `seed = patchInfo[0..5] || uid || block-index-LE` against a known
   block. If wrong, port the rotation/permutation constants from the
   bubble-client-swift `PreLibre2.swift` reference (MIT) into
   `libreKeyStream`.
4. Set `libre2Gen1DecryptVerified = true`.

**Dexcom G6:**
- Confirm scan finds `Dexcom<TX_ID_LAST2>` or the bare 2-char suffix.
- AES challenge response: if disconnected immediately after `0x04 + …`,
  the key derivation is off — print the derived key and check
  against the well-documented `"00" + txId + "00"` form.
- GlucoseRx parse: confirm bytes 10-11 (uint16 LE, low 12 bits) gives
  mg/dL within ±5 of finger-stick.

**Dexcom G7:**
- Stops at `STAGE_PAIRING_NEEDS_CERT`. Surfaces the message to UI.
- Real reading needs (a) coordinator-side cert provisioning UX,
  (b) J-PAKE implementation (Bouncy Castle EC J-PAKE or bundled
  mbedtls). Neither lands in this commit.

## What this plan is *not*

It's not a green light to skip the cohort decision. Step 1 (shell
smoke against a real Android device) and the Libre 1 verification of
step 2 are runnable today — they don't depend on cohort design.
Steps 3-6 (Libre 2 Gen1 decryption, Dexcom adapters, ops hardening)
should not start until the cohort decision lands and a
vendor/firmware-churn ops conversation has happened.
