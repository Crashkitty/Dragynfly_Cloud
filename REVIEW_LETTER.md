# Dragonfly Cloud — review handoff

> **Bottom line:** This zip contains the V1 pilot scaffold for the
> Diabetes Taiyi Intervention Pilot Study (Cloudflare-native, privacy-first)
> plus a scaffold for V1.5 Android-direct CGM ingestion. V1 is
> code-complete and ready for clinical/protocol review. V1.5 (real CGM
> capture on Android) is in tree but **untested on physical sensors** —
> it's ready for an Android engineer + sensors, not yet for participants.
> We need decisions from this team before participant enrollment can
> begin. The specific decisions are listed below by role.

## What's in the zip

Source-only Node monorepo (~270 files, ~1 MB unzipped). Six docs do the
heavy lifting; everything else is supporting code.

| File | Who it's for | What it answers |
|---|---|---|
| `README.md` | Everyone — start here | Project overview, layout, run instructions, V1 vs V1.5 status table |
| `docs/MVP_SCOPE.md` | Dr. Alana, PI | What V1 ships vs what's deferred. The contract this pilot is being built against. |
| `docs/PRIVACY.md` | Compliance, IRB | Trust boundaries, contributor rules, "what V1 does not claim" |
| `docs/AUDIT_LOG.md` | Compliance, PI | What's auditable today, what's not, retention posture |
| `docs/V1_5_PLAN.md` | Dr. Alana, biostatistician, Android eng | Android-first CGM direction, sensor-by-sensor honest state, the three cohort options (A/B/C), references inventory |
| `docs/HARDWARE_VERIFICATION_PLAYBOOK.md` | Android engineer | Concrete per-sensor verification procedure when the code first meets a real device |
| `docs/DEMO.md` | Anyone who wants to run it | 5-min end-to-end walkthrough |

Plus: `docs/CLOUDFLARED.md` (deployment shape), `docs/MVP_REQUIREMENTS.md`
(longer-form vision, deferred to V1.5+), `docs/TELEMED_INTEGRATION.md`,
`docs/CGM_INGESTION.md`, and the wireframes PPTX in the root.

## Reading guide by role

**If you have 10 minutes**, read just these in order:
1. `README.md` — first two sections + the V1 status table
2. `docs/MVP_SCOPE.md` — full
3. Skim `docs/V1_5_PLAN.md` → "Cohort question — needs a human decision"

**Dr. Alana (research lead)** — please read in full:
- `docs/MVP_SCOPE.md` — does the V1 scope match the IRB protocol's primary endpoint?
- `docs/V1_5_PLAN.md` — particularly the "Sensor targets — honest state" table and the three cohort shapes
- `docs/HARDWARE_VERIFICATION_PLAYBOOK.md` "Done criteria" — does the proposed acceptance bar match what you'd want for the pilot?

**Biostatistician** — focused read:
- `docs/V1_5_PLAN.md` "Cohort question" — A/B/C have very different data-fidelity implications. Specifically: the "mixed-platform, mixed-fidelity" option needs your sign-off before IRB will entertain it.

**Android engineer** — focused read:
- `docs/HARDWARE_VERIFICATION_PLAYBOOK.md` (start here)
- `docs/V1_5_PLAN.md` "What's in tree today — untested on hardware" table
- The three Kotlin reader files: `packages/capacitor-dragonfly-sensor-bridge/android/src/main/java/com/dragonfly/shell/sensorbridge/{Libre,DexcomG6,DexcomG7}*.kt`

**Compliance / IRB-adjacent reviewer** — focused read:
- `docs/PRIVACY.md` (full — section 8 "Staff trust path" is the most-recently-updated)
- `docs/AUDIT_LOG.md` (full)
- `docs/MVP_SCOPE.md` "What V1 deliberately does **not** claim" section

**Executive / sponsor** — TL;DR is what you need; the README's status table is the next level.

## Open decisions we need from you

These are not engineering questions. They're the gates between
"code-complete scaffold" and "participants can enrol."

| # | Decision | Who can answer | Why it gates |
|---|---|---|---|
| 1 | Does the IRB primary endpoint require CGM, or is HbA1c / self-report sufficient? | Dr. Alana + PI | If CGM is required, V1.5 is on the critical path. If not, V1 can start the pilot and V1.5 is a parallel V1.5 effort. |
| 2 | Cohort shape: A (mixed-platform), B (study-provisioned Android), or C (CGM as protocol-secondary)? | Dr. Alana + biostatistician + IRB | Determines whether V1.5 needs to land before enrollment, what hardware budget we need ($8-20k for option B), and how the study analysis pools its data. |
| 3 | Vendor BAA posture for Dexcom and Abbott — partner SDK, reverse-engineered DIY, or no-CGM? | Compliance + PI | The current V1.5 code is the DIY path. Partner SDK is months and a different code direction. |
| 4 | Android engineer assigned for hardware verification, with at least one sensor of each target type (Libre 1, Libre 2 Gen1, Dexcom G6, Dexcom G7) | Engineering manager | Without this, V1.5 stays code-only. The playbook expects ~1-2 days of bench work per sensor type. |
| 5 | License direction for the Dragonfly repo itself (currently unlicensed / proprietary by default) | Founder + legal | Affects whether we can link GPL references (xDrip+, Juggluco) or must keep a clean-room boundary. Today's code is clean-room. |

## What this scaffold explicitly does NOT claim

The repo is studiously honest about this and we want to surface it
plainly here so no one reads more into the demo than is there:

- **Not HIPAA-compliant.** It's a privacy-first research scaffold
  designed *with* healthcare security in mind. Vendor BAAs, formal
  RBAC, retention/deletion policies, key rotation, and a privacy
  review are all required before real PHI touches it.
- **No real CGM readings yet.** V1 uses participant-entered glucose
  values only. V1.5's Android adapters are code-complete but have
  not been validated against physical sensors.
- **No production patient authentication.** Patient login is a
  study-ID lookup, supervised by a coordinator. Production OIDC is
  deferred.
- **No AI summaries.** BASTION integration and AI-assisted summaries
  remain placeholders.
- **Dexcom G7 reads do not produce values yet.** The BLE wire and
  pairing sequence are implemented; the J-PAKE step that needs a
  per-transmitter certificate is the upstream open-source community's
  current wall too, not just ours.

## What V1 *does* demonstrate today

Tested via the running dev stack (browser-based smoke test only — no
real participants, no real sensors):

- Patient PWA: study-ID login, dashboard, manual glucose log, food
  diary with R2 photo upload, telemed request flow, profile.
- Provider dashboard: queue with flag rollups, patient detail with
  glucose sparkline, workflow tasks, one-click telemed launch with
  stable room IDs.
- Audit review: minimal staff-only `/audit` surface, filterable by
  event type / actor / target id, with click-to-filter and relative
  timestamps. Every clinical action produces an append-only audit row
  with no PHI.
- Staff trust path: Cloudflare Access in production, `STAFF_LOCAL_SECRET`
  in local dev. No fake enterprise OIDC.
- Telemed: WebRTC mesh with operator-supplied ICE; no third-party
  STUN baked in.
- Privacy posture: self-contained primary path; no vendor diabetes
  platform in V1.

## To run it yourself

```bash
# from the unzipped root
npm run bootstrap        # one-time: install + .dev.vars + D1 migrations
npm run dev              # api, patient, provider, telemed in one terminal
```

Then http://localhost:5174 (paste `dev-only-please-rotate-me` for staff
sign-in), http://localhost:5173 (patient PWA, click TY-0001 pill).
Full walkthrough in `docs/DEMO.md`.

## Response window

We'd like initial reactions back by **end of week** so we can converge
on cohort shape (decision #2) and Android engineer assignment
(decision #4) before any further code work. Engineering can keep
going on the V1.5 / hardware-verification path independently; the
other decisions are the gates that matter for participant enrollment.

If anything in the docs is unclear, or if a reviewer needs a different
slice of the doc tree for their role, please flag — we can rewrite
or extract as needed.

— The builder
