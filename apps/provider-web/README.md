# Provider web

Desktop-first React dashboard for providers, principal investigators, and
research staff working on the Diabetes Taiyi Intervention Pilot Study.

This is a **staff-only surface**. Patients do not use this app. The
trust boundary that gates it is documented in
[`docs/PRIVACY.md`](../../docs/PRIVACY.md) and
[`docs/CLOUDFLARED.md`](../../docs/CLOUDFLARED.md).

## Run locally

```bash
# from repo root
npm install

# in workers/api/.dev.vars (gitignored), set:
#   STAFF_LOCAL_SECRET="dev-only-please-rotate-me"
# This is the secret the dashboard's "Staff sign-in" prompt expects.

npm run dev:provider   # http://localhost:5174
npm run dev:api        # http://localhost:8787
```

The first paint shows a **Staff sign-in** card asking for the local
secret. It is held in `sessionStorage` for the tab and sent on every
staff request as `X-Staff-Local-Secret`. The persistent banner across
the top of the dashboard shows which trust path is active — local-dev
or Cloudflare Access — and gives a "forget secret" link in dev.

## Routes

- `/` — patient queue with KPIs and flag filter
- `/patients/:patientId` — patient overview, glucose trend, meals, tasks, telemed
- `/audit` — operational audit review (most recent 200, filterable by event type, actor, target id)

## Trust path

| Mode | When | What the app does |
|---|---|---|
| `cloudflare-access` | Production. Build with `VITE_STAFF_AUTH_MODE=cloudflare-access`. | No sign-in prompt. Cloudflare Access has already authenticated the browser; the Worker reads `Cf-Access-Authenticated-User-Email` from the forwarded request. |
| `local-dev` (default) | Local development. | Prompt for `STAFF_LOCAL_SECRET`; send it on every staff request. Audit log records `actor_id = "local-dev"`. |

There is no in-app password store, OIDC flow, or custom session cookie.
The two paths above are the entire trust surface for this dashboard.
See [`docs/CLOUDFLARED.md`](../../docs/CLOUDFLARED.md) for the deployment
shape.

## Audit review surface

`/audit` calls `GET /api/audit` on the Worker (staff-gated, capped at
500 rows server-side). The screen is intentionally minimal — operational
review, not analytics. Privacy properties of the rows are governed by
[`docs/AUDIT_LOG.md`](../../docs/AUDIT_LOG.md); the screen renders what
the Worker returns and adds nothing.

## Telemed integration

The "Start video room" button in patient detail opens the Cloudflare-native
telemed sub-app at `VITE_TELEMED_BASE_URL/new`. The telemed worker mints a
room id and redirects to `/r/<roomId>`. The provider then shares the URL
with the patient out of band; in a real deployment, the server side would
issue paired links and mint room IDs deterministically per session.
