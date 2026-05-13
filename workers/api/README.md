# Worker API (`@dragonfly/api`)

Cloudflare Workers JSON API for Dragonfly Cloud, built with **Hono**.

## Routes

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/api/auth/bridge-token` | Headless mint of a bridge bearer token. Requires `X-Provisioning-Secret`. Same effect as the staff UI flow below |
| `POST` | `/api/provisioning/bridge-tokens` | **Staff only.** Mint a bridge token (returns the raw bearer once + a 12-char hash prefix) |
| `GET` | `/api/provisioning/bridge-tokens?patientId=` | **Staff only.** List issued tokens for a patient (hash prefix + label + createdAt; never the full hash) |
| `DELETE` | `/api/provisioning/bridge-tokens/:prefix` | **Staff only.** Revoke a token by its 12-char hash prefix; refuses zero or multiple matches |
| `GET` | `/api/patients` | List participants |
| `POST` | `/api/patients` | Create participant |
| `GET` | `/api/patients/:id` | Patient by id |
| `GET` | `/api/patients/by-enrollment/:enrollmentId` | Patient by study id (patient PWA login) |
| `GET` | `/api/patients/:id/overview` | **Staff only.** Aggregated patient view (provider detail) |
| `GET` | `/api/glucose?patientId=` | List glucose readings |
| `POST` | `/api/glucose` | Add reading; status computed server-side |
| `POST` | `/api/glucose/sync` | **Auth required**. Bridge batch upload, idempotent on `(rawDeviceId, timestamp)` |
| `GET` | `/api/meals?patientId=` | List meal entries |
| `POST` | `/api/meals` | Add meal entry |
| `POST` | `/api/uploads/sign` | Mint signed `{ putUrl, getUrl, key }` for a private R2 object |
| `PUT` | `/api/uploads/<key>?op=put&exp&sig&ct` | Upload bytes to R2 (HMAC-validated) |
| `GET` | `/api/uploads/<key>?op=get&exp&sig` | Stream a private R2 object (HMAC-validated) |
| `GET` | `/api/telemed?patientId=` | List telemed sessions |
| `POST` | `/api/telemed` | Request a telemed session |
| `PATCH` | `/api/telemed/:id/status` | Update session status |
| `GET` | `/api/provider/queue` | **Staff only.** Provider queue with flag/last-reading rollup |
| `GET` | `/api/provider/tasks?patientId=` | **Staff only.** List open provider tasks |
| `POST` | `/api/provider/tasks` | **Staff only.** Create a provider task |
| `PATCH` | `/api/provider/tasks/:id` | **Staff only.** Update task state |
| `GET` | `/api/audit` | **Staff only.** Recent audit rows with optional `eventType`, `actorKind`, `targetKind`, `targetId`, `limit` filters (cap 500) |

All POST/PATCH bodies validated by hand-rolled validators in
`packages/shared/src/validate.ts` to keep the bundle small.

## Persistence

`src/repo/index.ts` returns a `Repo`:

- **`D1Repo`** — selected when the `DB` binding is present. Schema in
  `migrations/0001_init.sql`. Self-contained, owned by Dragonfly. Idempotent
  CGM dedup is enforced by a partial unique index
  `(patient_id, raw_device_id, timestamp) WHERE raw_device_id IS NOT NULL`.
- **`MemoryRepo`** — selected when `DB` is unbound. Per-isolate, pre-seeded;
  development only.

A future `MongoRepo` can slot in by implementing the same interface; the
toggle in `getRepo()` decides at runtime.

## Staff auth boundary

Routes marked **Staff only** above go through `requireStaffAccess`
(`src/auth.ts`). Production deployments must sit behind Cloudflare
Access — Access authenticates the operator at the edge against your IdP
and forwards `Cf-Access-Authenticated-User-Email` plus
`Cf-Access-Jwt-Assertion`. The middleware reads the email as the audited
actor identity and, when `CF_ACCESS_AUD` is configured, asserts the JWT
audience matches.

Local dev uses the explicit shared-secret bypass: set
`STAFF_LOCAL_SECRET` in `.dev.vars` and have the dashboard send
`X-Staff-Local-Secret` on every staff request. Audit rows mark these
calls with `actor_id = "local-dev"`. Production Workers must leave
`STAFF_LOCAL_SECRET` unset — the middleware only honours the bypass
when the env var is present.

There is no in-Worker password store, OIDC flow, or session cookie. The
two trust paths above are the entire staff surface. See
[`docs/CLOUDFLARED.md`](../../docs/CLOUDFLARED.md) for the deployment
shape.

## Bridge sync auth

`POST /api/glucose/sync` requires `Authorization: Bearer <token>`. Tokens
are minted by the coordinator-only endpoint:

```bash
# Coordinator mints a token for a specific patient (one-time output):
curl -sX POST http://localhost:8787/api/auth/bridge-token \
  -H "Content-Type: application/json" \
  -H "X-Provisioning-Secret: $BRIDGE_PROVISIONING_SECRET" \
  -d '{"patientId":"<patient-uuid>","label":"Mei iPhone"}'
# → { "patientId": "...", "token": "<raw bearer; show once>", ... }
```

Only a SHA-256 hash of the raw token is persisted in `bridge_tokens`. The
sync handler enforces that `batch.patientId` matches the token's
`patientId` and overrides every reading's patientId server-side, so a
compromised or buggy bridge cannot cross-write into another participant.

## Signed R2 uploads

`POST /api/uploads/sign` returns:

```json
{
  "key": "meal_photo/<patientId>/<rand>-<safe-filename>",
  "putUrl": "/api/uploads/<key>?op=put&exp=<ms>&sig=<urlsafe-b64>&ct=image%2Fjpeg",
  "getUrl": "/api/uploads/<key>?op=get&exp=<ms>&sig=<urlsafe-b64>",
  "putExpiresAt": "...",
  "getExpiresAt": "..."
}
```

- The bucket is private; nothing is reachable without a Worker-signed URL.
- `putUrl` lives 5 minutes, `getUrl` 24 hours. Overwrites on the same key
  are refused (409). Disallowed content types and oversize bodies are
  rejected before R2 is touched.
- HMAC key: `UPLOAD_SIGNING_SECRET` (Workers secret).

## Dev

```bash
# from repo root
npm install

# 1) Local D1 schema (required once per dev sqlite file).
cd workers/api
wrangler d1 execute dragonfly --local --file=migrations/0001_init.sql

# 2) Dev secrets (gitignored). Both required for /api/uploads and /api/auth/bridge-token.
cp .dev.vars.example .dev.vars
# edit .dev.vars to set strong values

# 3) Run the Worker.
cd ../.. && npm run dev:api
# → http://localhost:8787
```

## Bindings (wrangler.toml)

```toml
[vars]
ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:5174"

[[d1_databases]]
binding = "DB"
database_name = "dragonfly"
database_id = "<set after `wrangler d1 create dragonfly`>"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "dragonfly-media"
```

Secrets:

- `UPLOAD_SIGNING_SECRET` — HMAC key for signed upload/download URLs.
- `BRIDGE_PROVISIONING_SECRET` — coordinator gate for bridge token issuance.
- `STAFF_LOCAL_SECRET` — **dev only**. Local-dev bypass for the staff
  auth gate. Must be unset in production; leave it out of `wrangler
  secret put` for prod environments.
- `CF_ACCESS_AUD` — production. Cloudflare Access Application AUD tag.
  Defence-in-depth check that staff requests carry an Access JWT issued
  for this exact application.

## Deploy

```bash
cd workers/api
wrangler login
wrangler d1 create dragonfly        # paste id into wrangler.toml
wrangler r2 bucket create dragonfly-media
wrangler secret put UPLOAD_SIGNING_SECRET
wrangler secret put BRIDGE_PROVISIONING_SECRET
wrangler d1 execute dragonfly --remote --file=migrations/0001_init.sql
npm run deploy
```
