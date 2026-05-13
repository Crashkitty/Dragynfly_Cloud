# Privacy Boundaries

Dragonfly Cloud is a **privacy-first** clinical research workflow scaffold.
This doc enumerates the trust boundaries in the system, the **primary
trusted data path** the architecture defends, and the rules every
contributor follows so we don't quietly drift into vendor-cloud
dependence.

## Primary trusted path

```text
sensor → native bridge → Dragonfly Worker API → Dragonfly storage → Dragonfly UI
```

Everything inside that arrow is owned by Dragonfly: the iOS/Android
bridge, the Hono Worker, the repository-backed datastore, and the React
PWAs. **No third-party diabetes platform or vendor cloud sits in this
path.**

Specifically banned from the primary path:

- Dexcom Share / Dexcom developer cloud OAuth
- Abbott LibreView / LibreLink Up
- Nightscout
- Tidepool
- HealthKit (iOS) and Health Connect (Android) as the *primary* source
- Any third-party diabetes data relay or aggregator

These can later exist as **optional interoperability paths** behind a
feature flag, off by default, with explicit per-participant consent — but
they are not in V1.

## Trust boundaries (what crosses what)

| # | Boundary | Owner | Carries PHI? | Notes |
|---|---|---|---|---|
| 1 | Sensor ↔ phone (BLE/NFC) | Vendor radio + native bridge | Yes | Vendor SDK is the only third-party code; vendor types must not leak past the adapter file |
| 2 | Phone ↔ Worker API (HTTPS) | Dragonfly | Yes | Always TLS; bearer auth; CORS allow-list |
| 3 | Worker ↔ datastore | Dragonfly | Yes | Repo abstraction (`workers/api/src/repo`); MVP is in-memory, MongoDB adapter is the next slot |
| 4 | Browser ↔ telemed Worker (WS) | Dragonfly | Topic + name only | WebSocket signaling; media flows P2P |
| 5 | Browser ↔ STUN server | Google STUN (deferred opt-out) | **No** — IP/port only | STUN never sees media or signaling; ICE candidates only. See "Telemed STUN" below |
| 6 | Browser ↔ peer (WebRTC) | Dragonfly + peer | Yes (live AV + chat) | E2E DTLS-SRTP between browsers; never traverses our Workers |
| 7 | Worker ↔ R2 (future) | Cloudflare | Yes (meal photos, consent docs) | Bucket private; only signed URLs are issued; never embed object URLs in JSON |
| 8 | Worker ↔ audit_log (D1 table) | Dragonfly | **No** (rule below) | Append-only event trail; patient/session IDs and short outcome strings only — no PHI body, no free-text input |
| 9 | Browser ↔ provider-web (staff surface) | Dragonfly + Cloudflare Access | Yes (staff sees PHI on screen) | Production: Cloudflare Access at the edge issues an authenticated session before the bundle loads. Local dev: an explicit shared secret (`STAFF_LOCAL_SECRET`). Patient PWA does not share this trust path. |

## Rules every contributor follows

1. **No third-party diabetes service in the primary path.** If you find
   yourself adding a Dexcom/Libre/Nightscout/Tidepool client to
   `workers/api` or to a sensor adapter, stop — that client belongs in a
   separate, explicitly opt-in interoperability worker, off by default.
2. **No analytics or telemetry vendors by default.** Do not pull in
   Google Analytics, Mixpanel, Segment, Amplitude, Sentry, etc., on any
   surface that touches PHI. If we need error reporting, we self-host or
   redact.
3. **No PHI in push notifications.** Server-side push, when it lands,
   may carry an ID that maps to data once the app is open — never the
   reading itself, never the patient name.
4. **No public object URLs.** Meal photos and consent docs go to R2 with
   short-lived signed URLs minted by the Worker. The bucket is private;
   nothing should be reachable by URL guessing.
5. **No PHI in Workers logs.** `console.log`/`console.error` in
   `workers/api/src/**` may not include `valueMgDl`, `notes`, names, or
   any free-text patient input. Log IDs and HTTP status only. The same
   rule applies to the `audit_log` table — see
   [`AUDIT_LOG.md`](AUDIT_LOG.md) for the inventory.
6. **CORS allow-list is mandatory.** `workers/api/wrangler.toml` sets
   `ALLOWED_ORIGINS`; do not loosen this to `*`.
7. **Bridge never calls a vendor cloud.** Adapters do BLE/NFC against
   the device. They do not call `api.dexcom.com`, `libreview.com`,
   Nightscout, or any aggregator.
8. **Staff surfaces are gated.** Routes under `/api/provider`,
   `GET /api/patients/:id/overview`, and `GET /api/audit` go through
   `requireStaffAccess`. Production runs behind Cloudflare Access;
   local dev requires `STAFF_LOCAL_SECRET`. Do not add a new staff
   route without applying the middleware. Patient-facing routes
   (`/api/glucose`, `/api/meals`, `/api/telemed`, `/api/uploads`) are
   not behind the staff gate — those carry their own per-patient or
   bridge-token auth.

## Staff trust path

The provider dashboard and its API endpoints are a **staff-only
surface**. Two trust paths are supported, and only two:

1. **Cloudflare Access (production).** Put a Cloudflare Access
   application in front of both the provider-web origin and the
   Worker hostname. Access authenticates the operator at the edge
   against your IdP, then forwards `Cf-Access-Authenticated-User-Email`
   and `Cf-Access-Jwt-Assertion` to the Worker. The Worker treats those
   headers as authoritative; if `CF_ACCESS_AUD` is configured it also
   asserts the JWT audience to defend against application
   misrouting. Build the dashboard with `VITE_STAFF_AUTH_MODE=cloudflare-access`.
2. **`STAFF_LOCAL_SECRET` (development only).** Set the secret on the
   Worker's `.dev.vars` and on the dev box; the dashboard prompts
   for it at sign-in and sends `X-Staff-Local-Secret` on every
   staff request. Audit rows mark the actor as `local-dev`.
   Production Workers must leave `STAFF_LOCAL_SECRET` unset.

This codebase intentionally does **not** ship enterprise OIDC, an
in-app password store, or a custom session cookie. The two paths
above are the entire staff trust surface.

## Telemed ICE: operator-controlled, no third-party defaults

The room client (`apps/telemed/public/room.js`) fetches its ICE config
from `GET /api/ice` on the telemed Worker at startup. The Worker
returns whatever the operator configured in env (`STUN_URLS`,
`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`). **No third-party
STUN/TURN server is baked in.** When env is empty, the call falls back
to a direct connection that works on permissive networks but will fail
on symmetric NATs — and the room status banner says so.

Recommended deployment: **self-hosted coturn behind `cloudflared`**.
A $5/mo VPS running coturn, fronted by a Cloudflare named tunnel,
delivers both STUN and TURN under a private hostname. See
[`CLOUDFLARED.md`](CLOUDFLARED.md) for the config snippet.

Cloudflare Calls (when GA) is a comparable alternative on the same
edge network we already use.

CGM ingestion does not touch ICE; this concerns telemed only.

## Deferred interoperability paths

The shared schema includes ingestion-path values that V1 does **not**
exercise:

- `ingestionPath: "healthkit"` — V2 opt-in, requires HealthKit
  entitlements and explicit per-participant consent in the patient PWA.
- `ingestionPath: "health-connect"` — V2 opt-in, equivalent on Android.

Their presence in `packages/shared/src/constants.ts` is intentional:
when we eventually permit interop, the schema doesn't churn. They are
not part of the primary trusted path today.

## Compliance posture

This codebase is a **privacy-first MVP, designed with healthcare
security requirements in mind**. It is **not** HIPAA-compliant and
must not be marketed as such. Pilot deployments must, before touching
real PHI:

- Sign vendor BAAs (Cloudflare, MongoDB Atlas if used, Dexcom, Abbott).
- Implement RBAC for staff-facing surfaces (Cloudflare Access in front
  of provider web is the planned pattern).
- Add audit logging for staff access, edits, exports, and AI outputs.
- Define retention/deletion policies and key rotation.
- Run a privacy review before enabling any deferred interoperability
  path.

Refer to `docs/MVP_REQUIREMENTS.md §9 (Security)` and §12.3 for the
full set of compliance gates.
