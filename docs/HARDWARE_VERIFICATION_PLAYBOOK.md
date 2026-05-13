# V1.5 hardware verification playbook

For the Android engineer sitting down with a phone and at least one CGM.
The code in this commit is structured against published protocol notes
but has **not been run against a real sensor**. This document is the
"how to find out what's wrong, fix it, and report back" guide.

## What you need

| Thing | Note |
|---|---|
| Android phone | API 31+ recommended (Android 12 or newer). NFC required for Libre. BLE required for Dexcom. |
| Android Studio | 2024.1 or newer for AGP 8.5 + JDK 17. |
| `npm`, `node`, `npx cap` | Repo root has `npm run bootstrap` for the rest. |
| Worker reachable from the phone | LAN IP, or `cloudflared tunnel --url http://localhost:8787` (see `docs/CLOUDFLARED.md`). Put the right URL into `apps/patient-shell/capacitor.config.ts` `plugins.DragonflySensorBridge.apiBase`. |
| Sensors | At least one of: Libre 1, Libre 2 Gen1, Dexcom G6 (with known transmitter ID), Dexcom G7. The more the better. |
| A working finger-stick BG meter | Ground truth for value verification. |
| A second phone or a known-good DIY CGM app | (Optional but very useful) For Libre 2 Gen1, a paired plaintext FRAM dump from xDrip+/Juggluco of the same sensor is the test vector you need. |

## First boot — shell smoke

Before touching any sensor, verify the Capacitor shell + plugin wiring
land correctly. This costs ~10 minutes and catches the boring problems
(network, signing, manifest merge) before any vendor BLE/NFC work.

```bash
# from repo root
npm run bootstrap                              # idempotent
npm run dev                                    # leave running

# in another terminal
cd apps/patient-shell

# Put the LAN IP your phone can actually reach into capacitor.config.ts:
#   plugins.DragonflySensorBridge.apiBase = "http://192.168.x.x:8787"
# Save.

VITE_FEATURE_BRIDGE=true npm run build:web    # builds the PWA WITH bridge UI
npx cap add android                            # materializes android/ once
npx cap sync                                   # copies dist + plugin sources

npx cap open android                           # opens Android Studio
```

In Android Studio: build → run on the device. The patient PWA loads
inside the WebView. Steps to validate:

1. **Login.** Tap the `TY-0001` pill → Continue. You should reach the
   dashboard. If you get "couldn't reach the server," the `apiBase` in
   `capacitor.config.ts` is wrong; LAN-IP usually fixes it.
2. **Open the Bridge screen.** Profile → Sensor bridge. Confirm:
   - Backend pill shows **Native shell** (not Web demo).
   - You see three sensor cards: Libre NFC, Dexcom G6, Dexcom G7.
3. **Mint and install a token.** In another browser, open the
   provider dashboard at the dev host (e.g. `http://192.168.x.x:5174`).
   Sign in with `STAFF_LOCAL_SECRET`. Open Mei Chen → Bridge tokens →
   Mint new token → Copy. Paste into the Android Bridge screen →
   Install on this device. Status flips to "Installed".
4. **Send a demo reading.** From the same Bridge screen, type `120` →
   Send demo reading. Confirm `accepted=1 duplicates=0 rejected=0`.
   Check the provider dashboard: the new reading shows on Mei's row.

If steps 1-4 all pass, the shell + plugin wiring is correct. Now move
to real sensors.

If step 4 fails with a `sync failed: HTTP 401` it means the bearer
token wasn't attached — the Keychain/EncryptedSharedPreferences write
didn't take. Open Android Studio Logcat, filter by
`DragonflySensorBridge`, find the `installToken` call.

## Libre 1 — should mostly work

This is the highest-confidence path. Libre 1 FRAM is unencrypted and
the protocol is fully public.

### Procedure

1. Have a Libre 1 sensor activated and at least 1 hour past warmup.
2. Bridge screen → **Read Libre sensor**. Phone NFC area to the sensor.
3. Expected: success banner like
   `Read 127 mg/dL from LIBRE_1. Sync accepted=1 duplicates=0.`
4. Cross-check with a finger-stick within ±20% (Libre 1 has wider
   bias than later generations; ±20% in the 70-180 mg/dL range is
   normal).

### If it fails

| Symptom | Likely cause | Fix |
|---|---|---|
| "Tag is not ISO-15693 / Libre" | Phone tapped a different NFC tag, or NFC area is off. | Find the phone's NFC sweet spot. Most Android phones it's centered on the back, ~2cm above the top. |
| "Could not read sensor patchInfo" | `NfcV.transceive(0x02 0xA1 0x07)` rejected. Some sensors expect different flags. | In `LibreNfcReader.kt::readPatchInfo`, try flags byte `0x22` instead of `0x02`. Some sensor firmwares want high-data-rate. |
| "FRAM too short: 0B" | Single-block reads returning errors. | In `readFram`, try multi-block read (cmd `0x23` with block count) or insert a `Thread.sleep(20)` between blocks. |
| Wrong value (e.g. 1700 mg/dL) | Trend-pointer byte offset is wrong. | In `parseLibreFramLatest`, the current code uses `headerBase + 2` (= byte 26 of FRAM). Some references put the latest-index at byte 26, others at byte 27. Try the other. |
| Value off by ~10% from finger-stick | Calibration constant. | Current code uses `raw / 8.5`. Try `raw / 8.7` or `raw / 8.5 + offset` — calibration varies per sensor batch and is not in scope here. |

### Report back

Open Android Studio Logcat, filter `LibreNfcReader`. Grab:
- The sensor patchInfo hex (printed when classify runs)
- The first 32 bytes of FRAM
- The mg/dL value returned vs finger-stick

## Libre 2 Gen1 — needs a test vector

The decryption stream cipher in this commit is documented in shape
(seed = patchInfo + UID + block index → keystream → XOR FRAM) but the
specific rotation/permutation constants are placeholders. **The flag
`libre2Gen1DecryptVerified` is `false` by default**, so the path
captures the encrypted FRAM and reports "decrypt unverified" cleanly
instead of producing garbage values.

### Procedure

1. Have a Libre 2 Gen1 sensor activated and >1 hour past warmup.
2. Bridge screen → **Read Libre sensor**. Tap.
3. Expected: a `LIBRE_2_GEN1` result with `unsupportedReason` set.
4. In Logcat: capture the encrypted FRAM hex.
5. On a side phone with xDrip+ or Juggluco, scan the *same* sensor.
   Export its plaintext FRAM dump.
6. Compare: write a one-off unit test of `decryptLibre2Gen1Fram` —
   feed in your captured encrypted FRAM + UID + patchInfo, assert the
   output equals the xDrip+/Juggluco plaintext.
7. If outputs don't match (almost certainly they won't on first try):
   replace the inner loop of `libreKeyStream` with the actual mixing
   function. The clean-room reference is bubble-client-swift's
   `PreLibre2.swift` (MIT-derived) — read the algorithm, write fresh
   Kotlin. Do not copy GPL source (xDrip+/Juggluco).
8. Once your unit test passes for one block: re-run the device flow.
9. When real-sensor values match a finger-stick within ±15%, set
   `libre2Gen1DecryptVerified = true` in `LibreNfcReader.kt`.

### Notes

- The keystream is the same for two sensors with the same UID +
  patchInfo (it's deterministic). So you only need *one* test vector
  to verify, not one per sensor.
- The XOR cipher is per-block, not chaining. Get block 0 right and
  the rest follow.
- If the FRAM CRC bytes (last 8 bytes of the decrypted result)
  validate against the documented CRC-16 polynomial, you have a
  strong second signal that decryption is correct, independent of
  the glucose value parse.

## Dexcom G6 — should mostly work

The G6 protocol is well-documented. The auth + read flow in
`DexcomG6BleReader.kt` follows the standard openaps/xDrip+ pattern.

### Procedure

1. Get the participant's G6 transmitter ID. It's 6 alphanumeric chars
   printed on the applicator and visible in the official Dexcom app.
2. Bridge screen → Dexcom G6 card → enter transmitter ID → **Read Dexcom G6**.
3. Expected: a "Connecting to G6…" busy state, then up to 5 minutes
   of wait. Worst-case is right after the previous broadcast.
4. Success: `Read 142 mg/dL from G6XX. Sync accepted=1 duplicates=0.`
5. Cross-check with finger-stick (G6 is typically within ±10%).

### If it fails

| Symptom | Likely cause | Fix |
|---|---|---|
| Scan never finds the device | Device not advertising (sleeping), or wrong name pattern. | Confirm the official Dexcom app shows the sensor connected. Try opening the Dexcom app briefly to wake the transmitter, then close it and re-scan. Note: G6 advertises every ~5 min; be patient. |
| Connects then disconnects immediately after `0x04 + …` write | Auth challenge response wrong. | In `deriveAuthKey`, the current code uses `"00" + txId + "00"`.substring(0,8). Verify the byte representation: it should be the ASCII bytes of those 8 chars, not the hex. Add a Logcat line dumping the derived key bytes and the AES output. |
| Authenticates but never gets a glucose notification | `controlChar` notifications not enabled. | Check Logcat for the `onDescriptorWrite` call on `CONTROL_CHAR_UUID`. If it never fires, the descriptor write after auth isn't completing. |
| Gets a glucose packet but value is wildly wrong | `parseGlucoseTx` offsets off. | Dump the raw 14+ byte packet from `onCharacteristicChanged`. Compare to the documented `GlucoseRxMessage` layout: opcode 0x4F, status, sequence, timestamp, glucose (uint16 LE low 12 bits at offset 10), state, trend at 13. |

### Report back

From Logcat, filter `DexcomG6BleReader`. Grab:
- Whether scan found the device, and the advertised name
- Whether onServicesDiscovered ran
- AES challenge raw bytes (in) and response raw bytes (out)
- The full GlucoseRxMessage packet hex
- Returned mg/dL vs finger-stick

## Dexcom G7 — verify wire, expect the cert wall

This is the honest one. The wire works, the pairing sequence runs,
and it stops cleanly at the J-PAKE cert.

### Procedure

1. Get the G7 advertised-name suffix. It's the last 4 hex chars of
   the device name. From the participant's enrollment sheet or by
   running `adb shell dumpsys bluetooth_manager | grep DXB` on a
   paired phone.
2. Bridge screen → Dexcom G7 card → enter suffix → **Test G7 pairing**.
3. Expected: connection succeeds, pairing-sequence opcodes 0A 00 / 0A
   01 / 0A 02 run, then the UI shows
   `STAGE_PAIRING_NEEDS_CERT — Need a per-transmitter J-PAKE
   certificate to continue.`
4. This is the expected outcome today. It proves the BLE wire is
   reachable and the pairing-sequence order matches what the G7
   actually expects.

### If it fails before NEEDS_CERT

| Symptom | Likely cause | Fix |
|---|---|---|
| Scan never finds device | G7 advertises only briefly. Wake by opening the official Dexcom app. | Same advice as G6. |
| `SERVICE_MISMATCH` | The auth service UUID has changed in newer firmware. | The current `G7_AUTH_SERVICE_UUID` is `F8081532-…`. In Logcat, list all services the device exposes; if a different one matches the 3535/3538 char pattern, use that. |
| Disconnects mid-sequence (before `STAGE_PAIRING_NEEDS_CERT`) | One of the `0A 00 / 0A 01 / 0A 02` writes is rejected. | Compare against the `documentedPairingSequence` constant in `DexcomG7BleReader.kt`. Make sure 3538 notifications are also enabled (current code only enables 3535). |

### What needs to land before G7 produces a real reading

1. **Coordinator cert provisioning.** A way for the staff to obtain
   the per-transmitter Dexcom-signed certificate and hand it to the
   participant out-of-band. The xDrip+ community currently QR-scans
   this from sources we cannot use in a clinical pilot. Two real
   paths: (a) vendor partner program (Dexcom Mobile SDK); (b)
   per-participant certificate extracted from the official Dexcom app
   under terms a vendor agreement covers.
2. **EC J-PAKE port.** Bouncy Castle has a J-PAKE primitive
   (`ECJPAKEParticipant`); Android has Bouncy Castle bundled. The
   port lives in `readDexcomG7Once` after the cert is supplied.
3. **Glucose subscription.** After J-PAKE clears, subscribe to the
   G7 control characteristic and parse GlucoseRx 0x4F — same packet
   layout as G6.

None of those land in this commit. The wire-verification today is
the first half of the work; the cert/J-PAKE work is the second half.

## How to report back

Per sensor, a short structured update:

```
SENSOR: Libre 1 / Libre 2 Gen1 / Dexcom G6 / Dexcom G7
DEVICE: <Pixel 7 / Samsung A54 / etc.>, Android <version>
PROCEDURE COMPLETED: <which steps>
RESULT: <"works" / "works after fix X" / "stuck on Y">
RAW PACKETS / FRAM (relevant hex): <attach Logcat excerpt>
FINGER-STICK COMPARISON: <reader mg/dL vs finger-stick mg/dL, n>
CODE CHANGES: <commit/diff if any>
OPEN QUESTIONS: <what's still unclear>
```

Drop these into a shared doc or PR description so we can converge
quickly without losing context across people.

## Things that are not your problem

These are tracked elsewhere — flag them if you hit them but don't try
to solve them in this pass:

- **Cohort design (A / B / C in V1_5_PLAN.md).** Dr. Alana +
  biostatistician call.
- **Vendor BAAs.** Compliance/legal call.
- **IRB protocol amendment.** PI call.
- **Apple iOS entitlement application.** A separate workstream if
  iOS direct-BLE becomes V2.

## Done criteria for this pass

The minimum that lets us go to Dr. Alana with "the engineering is
hardware-verified for V1.5 sensor scope":

- [ ] Libre 1: finger-stick comparison within ±20%, 5 readings.
- [ ] Libre 2 Gen1: `libre2Gen1DecryptVerified = true` and 5
      finger-stick comparisons within ±15%.
- [ ] Dexcom G6: 5 finger-stick comparisons within ±15%.
- [ ] Dexcom G7: pairing reaches `STAGE_PAIRING_NEEDS_CERT` reliably.
      No claim of full G7 read until J-PAKE + cert land.
- [ ] Every reading also appears on the provider dashboard within 30s.
- [ ] Audit log has the expected rows (mint, sync.accepted, viewed).

After that, the cohort + vendor + IRB conversation is what gates
participant enrolment, not engineering.
