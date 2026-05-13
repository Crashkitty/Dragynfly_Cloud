# Dragonfly Telemed

Cloudflare-native telemedicine sub-app. Reused from
[/home/dream/Documents/meet](../../docs/TELEMED_INTEGRATION.md) and slimmed
to the bits needed for the Diabetes Taiyi Intervention Pilot Study.

What was reused:

- **Workers + Durable Object signaling** — `src/index.ts` and `src/room.ts`
  follow the same pattern as the source project: each room is a Durable
  Object that fans out WebRTC signaling messages between connected peers.
- **WebRTC mesh client** — `public/room.js` keeps the source's mute, camera
  toggle, screen-share, chat, copy-link, reconnection, and connection-status
  indicators.
- **Static asset binding** — `wrangler.toml` uses `[assets]` to serve
  `public/` directly from the Worker, same as the source.

What was dropped (does not belong in the pilot scope):

- Admin password gate (`/api/verify-password`) and the `RateLimiter` Durable
  Object used to throttle it.
- Booking confirmation emails through Cloudflare Email Routing.
- Admin dashboard + login pages (`dashboard.html`, `login.html`, `book.html`).
- The `.admin-credentials` and email setup secrets — none were copied.

What was restyled:

- Landing page (`public/index.html`) and the room UI (`public/room.html`)
  now use the Dragonfly palette and Inter at sizes that match the design
  system.

## Run locally

```bash
# from repo root
npm install
npm run dev:telemed   # http://localhost:8788
```

The patient PWA (`http://localhost:5173`) and provider web
(`http://localhost:5174`) link into this Worker via `VITE_TELEMED_BASE_URL`
(default `http://localhost:8788`).

## Integration points

- **Patient app** — the `/telemed` screen has a "Join video room" button that
  opens `${VITE_TELEMED_BASE_URL}/new`. The telemed Worker mints a room id
  and redirects to `/r/<roomId>`.
- **Provider app** — patient detail's "Start video room" button does the same
  and PATCHes the related `TelemedicineSession` to `in_progress` against the
  Dragonfly API.
- **Session metadata** — `TelemedicineSession.roomId` (in
  `packages/shared/src/types.ts`) is the durable link between a session
  record and its telemed room. The MVP doesn't yet pre-mint room ids on the
  API side — that's a clean follow-up.

## Deferred

- TURN server config for restrictive networks (slot in `public/room.js`).
- Pre-minted room ids issued by the Dragonfly API and embedded in
  `TelemedicineSession.roomId`.
- BAA-eligible recording / transcription.
