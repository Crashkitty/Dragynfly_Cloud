# Telemedicine integration

Dragonfly Cloud's telemedicine sub-app lives at `apps/telemed/` and is
deployed as its own Cloudflare Worker. It was adapted from
`/home/dream/Documents/meet` so we did not have to rebuild WebRTC + Workers
signaling from scratch.

## Architecture at a glance

```text
Patient PWA              Provider web              Worker API
(localhost:5173)         (localhost:5174)          (localhost:8787)
       \                       |                        |
        \   /telemed → Join    |  /patients/:id →       |
         \  video room button  |  Start video room      |
          \                    |                        |
           \                   v                        v
            -------> apps/telemed Worker (localhost:8788) -- (WS)
                       |   /new   → mint roomId, 302 to /r/<id>
                       |   /r/<id> → serve room.html + room.js
                       |   /ws/<id> → upgrade into Durable Object
                       v
                     Browser <--- WebRTC P2P ---> Browser
```

Media flows directly between browsers; the Worker only relays SDP
offers/answers, ICE candidates, and chat messages.

## Why telemed is its own deployable

- It is a different operational shape than the API (long-lived WebSockets,
  Durable Objects per room).
- It can scale, fail, and be redeployed independently without touching the
  patient/provider apps.
- It can later be swapped for a HIPAA-eligible vendor (e.g. a SFU) by
  changing `VITE_TELEMED_BASE_URL` and the launch URL convention.

## Launch / link flow (stable-roomId)

- **Provider-initiated** (the primary launch path):
  patient detail's **Start video room** calls
  `POST /api/telemed/:id/start`. The Dragonfly Worker mints a roomId
  (or reuses the existing one — the call is idempotent), sets the
  session to `in_progress`, and returns the updated session. The
  provider browser opens `${VITE_TELEMED_BASE_URL}/r/<roomId>`.
- **Patient sees a "Join" link**: the patient PWA's Care tab refreshes
  on focus and on submit; when a session is `in_progress` and has a
  `roomId`, both the top "Your provider is ready" card and the
  per-session row show a Join link to the same `${VITE_TELEMED_BASE_URL}/r/<roomId>`.
  No copy-paste; both sides land in the same room.

`POST /api/telemed/:id/start` is the only way a roomId is minted — the
old `/new`-on-the-telemed-Worker path is no longer wired into the
patient/provider apps. That guarantees the roomId is auditable and
pinned to a session row.

## Session metadata shared with the Dragonfly API

The Dragonfly API tracks telemedicine intent and provider workflow on the
`TelemedicineSession` shape in `packages/shared/src/types.ts`:

```ts
TelemedicineSession {
  id, patientId, status, channel,
  topic, requestedAt, scheduledAt,
  roomId,    // ← link into apps/telemed
  notes
}
```

The Dragonfly Worker API mints the `roomId` (not the telemed Worker)
and persists it on the session row. Both apps then construct
`${VITE_TELEMED_BASE_URL}/r/<roomId>`. Pre-scheduled sessions are a
matter of writing the `roomId` ahead of time and flipping the status
when the room is ready — no protocol change needed.

## What stays standalone

- Room state lives entirely inside the Durable Object — no Mongo, no R2,
  no API call from the telemed Worker into the Dragonfly API.
- Identity is "name in localStorage" today; the next iteration should
  pass a signed token so the Worker can show the participant's study ID
  in the room without trusting the client name.
