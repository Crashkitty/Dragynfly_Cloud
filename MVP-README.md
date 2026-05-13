# Dragonfly Cloud

Suite of apps for clinical research, beginning with the **Diabetes Taiyi
Intervention Pilot Study**. The first wedge is a patient mobile experience
plus a provider/PI dashboard; long-term direction is a "build your own
study" platform.

This repo is a **privacy-first, Cloudflare-native PWA + native sensor
bridge MVP**:

- React + TypeScript everywhere on the front end
- Cloudflare Workers (with Hono) for the API
- **Cloudflare D1** for primary persistence — self-contained SQLite-on-edge
- Vite + `vite-plugin-pwa` for the patient PWA
- Cloudflare Workers + Durable Objects for telemedicine signaling
- **Native sensor bridge (iOS Swift package + Android Gradle module) for
  Dexcom/Libre BLE/NFC ingestion** — pure web BLE/NFC is not enough for
  this pilot's iOS-heavy cohort. Queue is encrypted at rest on both
  platforms; sync is bearer-authenticated and pinned to a patientId
- **R2 with HMAC-signed Worker URLs** for meal/glucose evidence — the
  bucket is private; nothing is reachable without a Worker-signed URL
- Telemed ICE config is **operator-supplied via env**; no third-party
  STUN is baked in
- `cloudflared` is the secure-tunnel/private-ingress option, not the runtime

A legacy Flutter prototype lives in `patient_app/` and is reference-only.

## Primary trusted path

```text
sensor → native bridge → Dragonfly Worker API → Dragonfly storage → Dragonfly UI
```

That arrow is **self-contained**. The pilot does not depend on any
third-party diabetes platform — no Dexcom Share, no LibreView, no
Nightscout, no Tidepool. HealthKit and Health Connect are deferred
opt-in interoperability paths, not the primary route. The telemed
Worker no longer ships with any third-party STUN baked in; ICE servers
are operator-supplied via env. Trust boundaries and the rules
contributors follow live in [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Layout

```text
dragonflycloud/
  apps/
    patient-pwa/          React + Vite + PWA, mobile-first
    patient-shell/        Capacitor wrapper hosting the PWA on iOS/Android
    provider-web/         React + Vite, desktop-first PI dashboard
    telemed/              Cloudflare Workers + WebRTC (adapted from /meet)
  workers/
    api/                  Hono on Workers; patients, glucose, meals,
                          telemed metadata, provider queue/tasks,
                          /api/glucose/sync for the native bridge
  packages/
    shared/               Shared TS types, schemas, validators, constants
                          — single source of truth for GlucoseReading
    capacitor-dragonfly-sensor-bridge/
                          Capacitor plugin: iOS Keychain + Android EncryptedSharedPreferences
                          token storage, owns POST /api/glucose/sync from native
  native/
    sensor-bridge/        CGM ingestion: BLE/NFC pairing + sync queue
      ios/                Swift package (DragonflySensorBridge)
      android/            Gradle module (com.dragonfly.sensorbridge)
      shared/             PROTOCOL.md (sync wire), ADAPTERS.md (contract)
  design/                 DESIGN.md (visual identity) + DTCG export
  docs/                   MVP requirements + integration notes
  patient_app/            Legacy Flutter prototype (reference only)
```

## Quick start

```bash
# one-time bootstrap: installs deps, copies .dev.vars from the example,
# and runs the local D1 migrations. Idempotent — safe to re-run.
npm run bootstrap

# everything in one terminal (concurrently fans out + colour-prefixes logs):
npm run dev
```

That brings up:

| Process | URL |
|---|---|
| api | http://localhost:8787 |
| patient | http://localhost:5173 |
| provider | http://localhost:5174 (staff sign-in: `STAFF_LOCAL_SECRET`) |
| telemed | http://localhost:8788 |

If you'd rather have separate terminals (handy for tailing one log
specifically), the per-app scripts still work: `npm run dev:api`,
`npm run dev:patient`, `npm run dev:provider`, `npm run dev:telemed`.

The patient PWA logs in by **study ID**. On first hit the D1Repo seeds
three demo participants (`TY-0001` Mei Chen, `TY-0002` Robert Alvarez,
`TY-0003` Aiko Tanaka) so the dashboards have data immediately. If `DB`
is unbound the Worker falls back to `MemoryRepo` for dev convenience.

The provider web (`http://localhost:5174`) is a **staff-only surface**.
On first paint it shows a "Staff sign-in" card asking for the
`STAFF_LOCAL_SECRET` you put in `workers/api/.dev.vars`. The secret is
held in `sessionStorage` for the tab and sent on every staff request as
`X-Staff-Local-Secret`. In production this surface sits behind
Cloudflare Access — see [`docs/CLOUDFLARED.md`](docs/CLOUDFLARED.md) for
the deployment shape.

Copy `.env.example` into per-app `.env.local` files if you need to point a
front-end at a non-default Worker URL.

For a guided 5-minute end-to-end walkthrough that exercises the whole
primary trusted path, see [`docs/DEMO.md`](docs/DEMO.md).

## V1 vs V1.5 scope

The single canonical scope statement is [`docs/MVP_SCOPE.md`](docs/MVP_SCOPE.md).
The V1.5 direction (Android-first CGM, sensor-by-sensor honest state,
references inventory, open cohort questions) is in
[`docs/V1_5_PLAN.md`](docs/V1_5_PLAN.md). When the V1.5 code lands on
a phone for the first time, the Android engineer follows
[`docs/HARDWARE_VERIFICATION_PLAYBOOK.md`](docs/HARDWARE_VERIFICATION_PLAYBOOK.md).
Short form below.

### V1 — shipping in the pilot

| Area | Status |
|---|---|
| Patient PWA (login, dashboard, glucose log, food diary, telemed entry, profile) | **Real**, mobile-first, installable PWA |
| Provider web (queue, patient detail, glucose chart, tasks, telemed launch, audit review) | **Real** |
| Telemed (rooms, signaling, video/audio, mute, camera, screen-share, chat, reconnect) | **Real**, adapted from `/home/dream/Documents/meet` |
| Worker API (Hono routes + validation + repository abstraction) | **Real** |
| Persistence | **D1 (Cloudflare SQLite-on-edge)**. Memory adapter remains for dev fallback |
| Auth (PWA) | **Study-ID lookup**. Sufficient for pilot under coordinator supervision. |
| Staff auth boundary | **Real**: `requireStaffAccess` middleware. Cloudflare Access in production; `STAFF_LOCAL_SECRET` in local dev. No fake OIDC. |
| R2 media upload | **Real** signed-URL flow on `POST /api/uploads/sign`; private bucket; 5-min PUT TTL, 24-h GET TTL |
| Telemed ICE config | **Real** `/api/ice` endpoint; operator supplies `STUN_URLS`/`TURN_URLS` via env. No Google STUN bundled |
| Audit log + review surface | **Real**: append-only `audit_log` table; staff `/audit` screen with filters, relative timestamps, click-to-filter. PHI never written into rows. |
| Telemed launch | **Real** stable-roomId flow: one click mints/reuses a roomId; patient's Care tab shows a live "Join" link for the same roomId |
| HIPAA compliance | **Not claimed.** Privacy-first research scaffold; pilot deployment requires vendor BAAs, RBAC, retention policy, privacy review. |

### V1.5 — architecturally supported, hidden from V1 UI

These exist in the codebase but are not part of the V1 pilot. They live
behind `VITE_FEATURE_BRIDGE` and similar flags so V1.5 is a config change,
not a code revert. See [`docs/MVP_SCOPE.md`](docs/MVP_SCOPE.md) for the
gates each one faces before activation.

| Area | State |
|---|---|
| CGM ingestion (Dexcom / Libre BLE+NFC) | Adapters stubbed. `native/sensor-bridge/{ios,android}` orchestration is real (Bridge, SyncClient, SyncQueue, encrypted-at-rest queue, adapter contract). Vendor IO is not implemented. Real-protocol paths face an Apple `bluetooth-central-background` entitlement gate on iOS and reverse-engineering completeness gaps for current-gen sensors. |
| `BridgeAdapter` runtime dispatch (patient PWA) | Real. `WebBridgeAdapter` (demo simulator) + `NativeBridgeAdapter` (host-injected). UI hidden in V1; flip `VITE_FEATURE_BRIDGE=true` to expose `/bridge`. |
| Native shell (iOS / Android) | Scaffolded: `apps/patient-shell/` (Capacitor) + `packages/capacitor-dragonfly-sensor-bridge/` (Keychain + EncryptedSharedPreferences plugin, owns `POST /api/glucose/sync` server-side). iOS / Android material projects generated locally via `npx cap add`. |
| Bridge token provisioning UX | Staff-gated mint/list/revoke route + `BridgeTokensPanel`. Hidden in V1; flip the same flag to expose. Headless `POST /api/auth/bridge-token` with `BRIDGE_PROVISIONING_SECRET` always available. |
| BASTION / BAST AI integration | Not started. |
| AI summaries | Not started. UI placeholder removed from V1. |
| HealthKit / Health Connect | Not started. V2+, opt-in only, behind explicit per-participant consent. |
| Production patient OIDC | Not started. |

## How telemedicine was reused

`apps/telemed/` is a slim adaptation of `/home/dream/Documents/meet`:

- Kept: `src/index.ts` router (room create + WebSocket forwarding) and
  `src/room.ts` Durable Object (signaling fanout); the WebRTC mesh client
  in `public/room.js`; mute / camera / screen-share / chat / reconnect.
- Dropped: admin password gate, rate-limit Durable Object, Cloudflare Email
  Routing booking notifications, and the admin/booking HTML pages — none of
  those secrets or bindings were carried over.
- Restyled: landing page and room UI now use Dragonfly tokens (Wing Teal
  primary, Lantern Clay CTA, Rice Paper neutral, Inter typography).

See [`docs/TELEMED_INTEGRATION.md`](docs/TELEMED_INTEGRATION.md) for
session-metadata flow.

## CGM ingestion — deferred to V1.5

V1 does **not** include CGM ingestion. Glucose values in the pilot are
manually entered by participants (with coordinator support). The
architecture supports CGM behind a feature flag: a `BridgeAdapter`
contract in the PWA, a native `SensorAdapter` boundary in
`native/sensor-bridge/{ios,android}`, an authenticated
`POST /api/glucose/sync` path with idempotent dedup, and a Capacitor
shell + plugin scaffold in `apps/patient-shell/` /
`packages/capacitor-dragonfly-sensor-bridge/`.

What V1.5 has to clear before CGM can activate, in priority order:

1. **iOS:** Apple's private `com.apple.developer.bluetooth-central-background`
   entitlement (required for sustained background BLE on iOS/watchOS;
   granted via Apple review).
2. **Vendor protocol completeness:** Libre 3 / Libre 2 Gen2 / Dexcom G7
   J-PAKE reverse-engineering is incomplete in the open-source community;
   or a vendor partner SDK (Dexcom Mobile SDK / LibreLink Up Partner) is
   the alternative path. Either way, a BAA conversation precedes
   touching real PHI.
3. **Cohort design:** if the pilot goes Android-first (where Juggluco's
   work is reusable today), participant cohort and study-issued-phone
   logistics need a coordinator/IRB conversation first.

Background and protocol notes live in
[`docs/CGM_INGESTION.md`](docs/CGM_INGESTION.md) and
[`native/sensor-bridge/README.md`](native/sensor-bridge/README.md).

## Cloudflare Tunnel (`cloudflared`)

Use `cloudflared` for secure ingress to local development services or to
expose privately hosted future origins (e.g. a self-hosted MongoDB
endpoint). It is not the runtime — the Workers above run on Cloudflare's
edge directly.

See [`docs/CLOUDFLARED.md`](docs/CLOUDFLARED.md) for setup snippets.

## Persistence strategy

All routes go through the `Repo` interface in
`workers/api/src/repo/types.ts`. V1 wires **`D1Repo`** (Cloudflare D1,
SQLite-on-edge) when the `DB` binding is present, falling back to
`MemoryRepo` for dev when it isn't. Schema lives in
`workers/api/migrations/0001_init.sql`. A future `MongoRepo` slots in
the same way without touching handlers.

## Compliance posture

This codebase is a **privacy-first MVP** and a **clinical research
workflow scaffold** designed with healthcare security requirements in
mind. It is **not** HIPAA-compliant and must not be marketed as such
until vendor BAAs, auth, audit logging, and operational controls are
finalized. See [`docs/PRIVACY.md`](docs/PRIVACY.md) for the trust
boundaries and the contributor rules that defend them.
