# Audit Log

Dragonfly writes a minimal audit trail to D1 for the high-value clinical
and security actions in the Worker API. The log is **append-only from
the API's perspective**; no route deletes or rewrites rows. Schema lives
in `workers/api/migrations/0002_audit.sql`.

## Privacy rule (load-bearing)

> Audit rows must not contain raw PHI.

- `target_id` carries a Dragonfly UUID (patient id, session id, etc.) —
  these are opaque outside our database and are not PHI on their own.
- `actor_id` is one of:
  - a Dragonfly patient id (opaque UUID, not PHI on its own),
  - a 12-char prefix of a SHA-256 hash of the offered bridge token
    (so we can correlate without storing the token),
  - the staff identity Cloudflare Access asserted on the request
    (typically a corporate email — a staff identifier, not patient PHI),
  - the literal string `local-dev` for requests that bypassed Access via
    `STAFF_LOCAL_SECRET` in development,
  - or `NULL`.
- `detail` is a short opaque string with counts, status names, and short
  outcome strings ("not found", "patientId mismatch"). Free-text patient
  input must never appear here.

If you add a new audit point, follow these rules. If you can't write a
useful detail without PHI, drop the detail.

## Events covered today

| `event_type` | Actor | Target | Triggered by | Notes |
|---|---|---|---|---|
| `patient.viewed` | provider | patient | `GET /api/patients/:id/overview` | One row per provider load (success or `denied` on 404). |
| `bridge_token.minted` | coordinator (CLI) or provider (UI) | patient | `POST /api/auth/bridge-token` (CLI) or `POST /api/provisioning/bridge-tokens` (UI) | `detail` includes a 12-char hash prefix and `via=...` for the UI path. |
| `bridge_token.revoke` | provider | patient (when prefix matched) | `DELETE /api/provisioning/bridge-tokens/:prefix` | `detail` includes the prefix and the auth path. Failed (no-match / multi-match) revokes are recorded with `outcome=invalid`. |
| `glucose.sync.accepted` | bridge | patient | `POST /api/glucose/sync` (success) | `detail = accepted=N duplicates=M rejected=K`. |
| `glucose.sync.invalid` | bridge | patient | `POST /api/glucose/sync` (validation fail) | First few validator errors are reproduced. |
| `glucose.sync.denied` | bridge | patient or `NULL` | `POST /api/glucose/sync` (auth fail or patient mismatch) | Reason in `detail`. |
| `upload.signed` | patient | upload (object key) | `POST /api/uploads/sign` | `detail = kind=<kind> ct=<contentType>`. The bytes themselves are not logged. |
| `telemed.session.created` | patient | telemed_session | `POST /api/telemed` | `detail = channel=<channel>`. |
| `telemed.session.updated` | provider | telemed_session | `PATCH /api/telemed/:id/status` | `detail = status=<status> [room=<id>]`. |
| `telemed.session.started` | provider | telemed_session | `POST /api/telemed/:id/start` | Idempotent. `detail` records whether the roomId was reused. |
| `audit.viewed` | provider | (none) | `GET /api/audit` | One row per staff load of the audit review surface. `detail` includes the row count returned and the auth path (`via=cloudflare-access` or `via=local-dev`). |

## Storage and retention

- **Where**: same Cloudflare D1 database as the rest of the application
  (`workers/api/wrangler.toml` → `[[d1_databases]] binding = "DB"`).
  No third-party log sink.
- **Indexes**: by `occurred_at`, by `(target_kind, target_id)`, and by
  `(event_type, occurred_at)`.
- **Growth**: each row is ~150 bytes; even 10k rows/day fits comfortably
  in D1's free tier and well under any retention concern for the pilot.
- **Retention**: pilot operators decide. The Worker does not delete
  rows on its own. A future scheduled trigger can sweep rows older than
  the operator's chosen window — that scheduled job does not exist
  today and would land in its own commit with explicit consent.
- **Backup**: covered by whatever D1 backup posture the operator
  enables; the Worker does not export audit data anywhere on its own.

## Inspecting

### Direct SQL (dev convenience)

```bash
# from workers/api/
wrangler d1 execute dragonfly --local --command \
  "SELECT occurred_at, actor_kind, event_type, target_kind, target_id, outcome, detail
     FROM audit_log
     ORDER BY occurred_at DESC
     LIMIT 50"
```

### Staff review API: `GET /api/audit`

`GET /api/audit` is the operational read endpoint. It is gated by the
same `requireStaffAccess` middleware as the rest of the staff surface
(see [`docs/CLOUDFLARED.md`](CLOUDFLARED.md) for the deployment shape:
Cloudflare Access in production, `STAFF_LOCAL_SECRET` in local dev).

Query parameters (all optional):

| Param | Notes |
|---|---|
| `eventType` | Exact match against `event_type`. Backed by `idx_audit_event`. |
| `actorKind` | One of `provider`, `patient`, `bridge`, `coordinator`, `system`. |
| `targetKind` | One of `patient`, `glucose_batch`, `upload`, `telemed_session`, `task`. Pairs with `targetId` for the `idx_audit_target` index. |
| `targetId` | Opaque Dragonfly UUID. |
| `limit` | Defaults to 200. Hard-capped at 500. |

Rows are returned newest-first. The route does not enrich rows with
PHI; it returns exactly what the writer persisted, so the privacy rule
above carries through unmodified. Each call writes one
`audit.viewed` row, recording the row count returned and the auth path
used.

### Staff review UI

`provider-web` exposes the same data at `/audit` as a small table with
event-type, actor, and target-id filters. The screen is intentionally
minimal — operational review, not analytics. The same staff trust path
gates both the UI and the underlying API.

## Retention and query assumptions

- Retention is **operator-controlled**. The Worker still does not delete
  rows on its own. A future scheduled trigger can sweep rows older than
  the operator's chosen window.
- Read-side limits: the API caps a single query at 500 rows. For larger
  exports run direct D1 SQL out-of-band — the staff UI is not an export
  tool.
- The review API does not paginate. The pilot cohort is small enough
  that "most recent N" with filters is sufficient; we'll add cursor
  paging when row volume justifies it.

## What is *not* in the audit log (yet)

- Patient PWA login attempts. Login is study-ID-only and unauth in V1;
  it'll move into the audit table when production auth lands.
- Static asset fetches.
- R2 PUT/GET success/failure (the *signing* event covers the intent;
  the put/get logs are covered by Cloudflare's request logging if
  enabled).
- Provider task create/resolve. They're still surfaced through the
  patient timeline; promote them to audit rows if a regulator asks.
