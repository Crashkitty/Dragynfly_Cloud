# Dragonfly V1 demo — end-to-end, no CGM

A 5-minute walkthrough of the V1 pilot path:

```
participant logs in → logs glucose manually → logs a meal →
requests a telemed session →
provider sees them on the queue → starts the video room →
participant joins → provider reviews audit
```

Everything below stays self-contained: no vendor diabetes platform,
no third-party analytics, no public object URLs. CGM ingestion is
deliberately not in V1 — see [`MVP_SCOPE.md`](MVP_SCOPE.md). Glucose
values are participant-entered.

## 0. One-time setup (one command)

```bash
# from repo root
npm run bootstrap
```

`scripts/bootstrap.mjs` is idempotent. It will:

- check your Node version
- run `npm install` if `node_modules/` is missing
- copy `workers/api/.dev.vars.example` → `.dev.vars` if absent
- run the local D1 migrations (`0001_init.sql`, `0002_audit.sql`)
- print the URLs and the seeded study IDs

## 1. Run everything in one terminal

```bash
npm run dev
```

| Process | URL |
|---|---|
| `api` | http://localhost:8787 |
| `patient` | http://localhost:5173 |
| `provider` | http://localhost:5174 (staff sign-in: `STAFF_LOCAL_SECRET`) |
| `telemed` | http://localhost:8788 |

Per-app scripts (`npm run dev:api`, …) still work if you'd rather
tail one log specifically.

## 2. Sign into the staff dashboard

1. Open <http://localhost:5174>. The **Staff sign-in** card appears.
2. Paste the value of `STAFF_LOCAL_SECRET` from `workers/api/.dev.vars`
   (the bootstrap output echoes it — `dev-only-please-rotate-me` by
   default).
3. The dashboard loads with a persistent banner showing
   `Local-dev secret` (would say `Cloudflare Access` in production).

There is no in-app password store. The staff trust path is documented
in `docs/PRIVACY.md` and `docs/CLOUDFLARED.md`.

## 3. Participant logs in and logs glucose

1. Open <http://localhost:5173>. Click the `TY-0001` pill on the login
   card → **Continue**. (You can also try `TY-0002` Robert Alvarez or
   `TY-0003` Aiko Tanaka — both seeded with prior data.)
2. From the home dashboard, tap **Logs** (bottom nav) → **Log
   glucose**. Pick a context (pre-Taiyi, post-Taiyi, lunch windows,
   end-of-day), enter a value, optionally a note.
3. Submit. The dashboard updates: the new value appears with a
   server-side status pill (`in range` / `warn` / `critical`).

Every submitted reading is real `POST /api/glucose` against the Hono
Worker, persisted in D1, and visible to staff within 30 seconds.

## 4. Participant logs a meal

1. Tap **Logs → Food diary**.
2. Enter a brief description (e.g. "Brown rice congee with bok choy"),
   optionally a carb estimate. Add a photo if you like — the photo
   takes the signed-URL path through R2 (private bucket, Worker-minted
   PUT/GET URLs).
3. Submit. The entry appears on the patient timeline.

## 5. Participant requests a telemed session

1. Tap **Care** in the bottom nav.
2. Enter a brief reason ("Post-lunch reading consistently > 200") and
   submit.
3. The session appears as `requested`. The Care tab refreshes on
   focus, so when the provider starts the room the **Join video
   room** button appears automatically.

## 6. Provider sees the participant, opens detail, starts telemed

1. Back to <http://localhost:5174>. The queue auto-refreshes every
   30 s (or click **Refresh**). TY-0001's row shows the new reading
   and the new pending telemed request.
2. Click into **Mei Chen** to open patient detail. You'll see the
   glucose sparkline (recent values overlaid), the new meal, and the
   pending telemed request on the right.
3. **Add a workflow task** ("Confirm new meal pattern is real"),
   click **Resolve** on an existing one.
4. Click **Start video room** under "Telemedicine". The Worker mints
   a stable roomId, marks the session `in_progress`, and opens
   `${VITE_TELEMED_BASE_URL}/r/<roomId>` in a new tab.
5. Switch to the patient tab → **Care** → the **Join video room**
   button is live and points at the same roomId. One click joins.

## 7. Inspect the audit trail

1. In the provider sidebar, click **Audit review** (or visit
   <http://localhost:5174/audit>).
2. You should see rows for:
   - `glucose.sync.accepted` *(if you happened to send anything via
     the API directly — not part of the V1 path)*
   - `patient.viewed` — one per provider load of patient detail
   - `upload.signed` — one per meal photo
   - `telemed.session.created` — when the participant requested
   - `telemed.session.started` — when the provider clicked Start
   - `audit.viewed` — one per load of this screen
3. Hover any timestamp to see the absolute date; the column shows the
   relative form ("3 min ago"). Click any event-type or target-id
   cell to set that filter.

Each row records actor, event type, target kind/id, outcome, and a
short opaque detail string. **No PHI is in those rows** — see
[`AUDIT_LOG.md`](AUDIT_LOG.md) for the full inventory.

## What V1 deliberately does not do

- **No real CGM capture.** Direct Dexcom / Libre BLE+NFC ingestion is
  deferred to V1.5; the architecture is in place but no V1 UI surfaces
  it. The bridge UI is hidden behind `VITE_FEATURE_BRIDGE=true` for
  preview work only.
- **No vendor cloud relay.** No LibreView, Dexcom Share, Nightscout,
  Tidepool, HealthKit, or Health Connect path in V1.
- **No production patient auth.** Study-ID activation is the only
  login. Production OIDC is deferred.
- **No AI summaries.** The previous patient-detail placeholder is
  removed from V1; AI work returns when BASTION integration starts.

See [`MVP_SCOPE.md`](MVP_SCOPE.md) for the full V1 vs V1.5 contract.

## (Preview only) CGM bridge demo path

If you want to exercise the deferred bridge path locally — e.g. to
keep the wiring tested while CGM stays out of V1 — set in both PWA
`.env.local` files:

```bash
VITE_FEATURE_BRIDGE=true
```

That re-exposes the patient `/bridge` screen and the provider-side
**Bridge tokens** panel. Mint a token from patient detail, paste it
into the patient PWA's bridge screen, send a synthetic reading. The
Worker endpoints are always mounted; only the UI is hidden in V1.
