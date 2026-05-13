# Dragonfly V1 — what's in, what's deferred

This is the operational scope statement for the **first wedge** of the
Diabetes Taiyi Intervention Pilot Study. The longer-form vision lives
in [`MVP_REQUIREMENTS.md`](MVP_REQUIREMENTS.md). When the two disagree,
this document is the V1 truth.

V1 is **deliberately small** so the pilot can start. CGM ingestion,
native shell distribution, BASTION integration, and AI summaries are
all deferred to V1.5 and beyond. The architecture supports them; the
shipped product does not include them.

## V1 — in scope, shipping

| Area | What ships |
|---|---|
| Patient PWA — auth | Study-ID activation (`TY-0001`, etc.). No production OIDC. |
| Patient PWA — glucose | Manual `valueMgDl` + context (pre-Taiyi, post-Taiyi, lunch windows, etc.). Server-side `ok`/`warn`/`critical` classification. |
| Patient PWA — food diary | Description, optional carb estimate, optional photo via signed R2 upload. |
| Patient PWA — telemed | Patient requests session; sees provider-minted room link on the Care tab. |
| Patient PWA — profile | Study ID, sign-out. |
| Provider web — queue | All enrolled participants, flag rollup, auto-refresh. |
| Provider web — patient detail | Glucose sparkline, recent readings, recent meals, workflow tasks, telemed actions. |
| Provider web — telemed launch | One-click stable-roomId mint; opens in a new tab; patient joins the same room. |
| Provider web — audit review | `GET /api/audit` filterable table; relative timestamps; click-to-filter. |
| Worker API | Hono + D1 + R2 (signed URLs). Idempotent glucose dedup. Append-only audit log. |
| Staff trust path | Cloudflare Access in production; `STAFF_LOCAL_SECRET` in local dev. |
| Telemed | Cloudflare Workers + WebRTC; operator-supplied ICE; no third-party STUN baked in. |

## V1 — deferred, but architecturally supported

The code for these exists or is scaffolded. They are **not part of the
pilot demo and not in any patient-facing path** until V1.5.

| Area | State | Why deferred |
|---|---|---|
| CGM ingestion (Dexcom / Libre BLE+NFC) | `native/sensor-bridge/{ios,android}` packages and `BridgeAdapter` runtime exist; vendor adapter code is stubbed. Both DiaBLE-style reverse-engineering and vendor partner SDKs are open paths. | Two real gates that V1 can't clear in time: (a) Apple's `bluetooth-central-background` private entitlement is required for sustained iOS background BLE and is granted via Apple review of vendor-partner-style applicants; (b) reverse-engineered protocols for current-gen sensors (Libre 3, Libre 2 Gen2, Dexcom G7 J-PAKE) are incomplete. See `docs/CGM_INGESTION.md`. |
| Native shell (iOS / Android) | Capacitor scaffold in `apps/patient-shell/`; Keychain + EncryptedSharedPreferences plugin in `packages/capacitor-dragonfly-sensor-bridge/`. | Without CGM, the native shell has no V1 job — the PWA is sufficient. Plugin is ready when CGM lands. |
| Bridge token provisioning UX | Staff-gated mint/list/revoke route + `BridgeTokensPanel`. | Same reason. Hidden in V1 builds via `VITE_FEATURE_BRIDGE`. |
| BASTION / BAST AI integration | Placeholder. | Vendor scope; not on V1 critical path. |
| AI summaries on patient detail | Placeholder removed from V1 UI. | Same. |
| HealthKit / Health Connect interop | Not started. | Privacy posture: opt-in, V2+ only, behind explicit consent. |
| Production patient auth (OIDC) | Not started. | Study-ID activation is sufficient for a small pilot cohort under a coordinator. |
| Audit retention sweeper | Not started. | Operator-managed; can be added without code if the pilot doesn't outrun D1 free-tier limits. |
| Population-trend / documents dashboards | Surfaces removed from V1 nav. | Not on the V1 critical path; will re-add when designed. |

## What V1 deliberately does **not** claim

- **HIPAA compliance.** Not claimed. Pilot deployment requires vendor BAAs (Cloudflare; whatever DB is used in prod), formal RBAC, retention/deletion policies, and a privacy review before touching real PHI. See [`PRIVACY.md`](PRIVACY.md) §"Compliance posture."
- **Real CGM capture.** No direct device data is read from Dexcom, Libre, or any other sensor in V1. Glucose values are participant-entered or coordinator-entered.
- **Production OIDC.** Patient login is a study-ID lookup; staff login is Cloudflare Access (production) or a shared dev secret (local).
- **AI clinical decision support.** None.

## V1 — primary trusted path

```text
participant → patient PWA (manual entry) →
Hono Worker → D1 → provider dashboard → audit log
```

No vendor diabetes platform sits in this path. No third-party analytics.
No public object URLs. R2 evidence (meal photos, future consent docs)
is private; only signed Worker-minted URLs reach the client. The
telemed Worker uses operator-supplied ICE only.

## How to enable V1.5 surfaces locally

For V1.5 / preview work, set in `apps/patient-pwa/.env.local` and
`apps/provider-web/.env.local`:

```bash
VITE_FEATURE_BRIDGE=true
```

That re-exposes the patient `/bridge` screen and the provider-side
**Bridge tokens** panel. Production builds leave it unset. The Worker
endpoints (`/api/auth/bridge-token`, `/api/provisioning/bridge-tokens`,
`/api/glucose/sync`) remain mounted either way — staff control still
applies, and headless scripts can still use them — but no V1 UI
surfaces them.

## How V1 ends

V1 succeeds when:

- A coordinator can enroll a participant, hand them a study ID, and the
  participant can log glucose + meals from their existing phone.
- The PI can see all participants on one queue, drill into a patient,
  add review tasks, and start a telemed session that the patient can
  join with one tap.
- Every clinical action above produces an append-only audit row, and
  staff can review them through `/audit` without leaving the dashboard.
- The staff trust path is honest in both dev and prod, with no fake
  enterprise auth.

V1.5 starts when at least one of: (a) Apple grants the BLE entitlement
through a real CGM-class application, (b) a vendor partner SDK is
signed and integrated, (c) the pilot decides to provision Android
phones and ships clean-room CGM adapters on the existing
`SensorAdapter` interface.

The committed direction is (c): **Android-first**, clean-room
implementations referencing xDrip+, Juggluco, and DiaBLE without
copying GPL source. The full V1.5 plan — sensor-by-sensor honest
state, license posture, implementation order, and the cohort
questions that gate work — lives in
[`V1_5_PLAN.md`](V1_5_PLAN.md). iOS direct-BLE stays deferred to
V2+.
