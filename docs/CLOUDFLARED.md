# `cloudflared` — secure ingress and tunnels

The MVP runtime sits on Cloudflare Workers, so most surfaces are exposed by
deploying — `cloudflared` is not in the request path for the API or the
telemed Worker. Use it when you need to:

1. Expose a **local dev** Worker, PWA, or future Mongo/Express origin to
   the internet over an authenticated tunnel — no public IP, no port
   forwarding.
2. Front a privately hosted origin (a clinical data importer, a worker that
   needs a long-lived TCP socket, an EHR adapter) behind a Cloudflare
   hostname with Access policies.

## Install

```bash
# macOS
brew install cloudflared
# Debian/Ubuntu
sudo curl -L --output /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo chmod +x /usr/local/bin/cloudflared
```

## Quick local tunnel (no DNS required)

This gives you a `*.trycloudflare.com` URL pointing at a local port,
useful for PWA testing on a real phone.

```bash
# expose the patient PWA dev server
cloudflared tunnel --url http://localhost:5173

# expose the Worker API dev server
cloudflared tunnel --url http://localhost:8787
```

You can then point the PWA at the tunneled API by setting
`VITE_API_BASE_URL=https://your-tunnel.trycloudflare.com` in
`apps/patient-pwa/.env.local`.

## Named tunnel with Access (production-shaped)

```bash
cloudflared tunnel login                          # browser SSO
cloudflared tunnel create dragonfly-private
cloudflared tunnel route dns dragonfly-private \
  api-private.dragonfly.example.com
cloudflared tunnel run dragonfly-private          # uses ~/.cloudflared/<id>.json
```

Pair the hostname with a Cloudflare Access policy (Zero Trust → Applications)
to require IdP login for staff surfaces. This is the path the production
provider dashboard follows before touching real PHI.

## Staff trust path (provider-web + staff API)

The provider dashboard and the Worker routes it depends on
(`/api/provider/*`, `GET /api/patients/:id/overview`, `GET /api/audit`)
are a **staff-only surface**. Production deployment shape:

1. Create one Cloudflare Access application that covers **both** the
   provider-web origin and the Worker hostname (or two apps that share
   an IdP and an `aud`). The Application Audience (AUD) tag is in the
   Zero Trust dashboard.
2. Apply an Access policy that requires your IdP — Google Workspace,
   Okta, GitHub org, etc. There is no in-app password flow.
3. Set on the Worker (`workers/api`):

   ```bash
   wrangler secret put CF_ACCESS_AUD          # paste the AUD tag
   # Do NOT set STAFF_LOCAL_SECRET in production.
   ```
4. Build the dashboard with the production trust path:

   ```bash
   # apps/provider-web/.env.production
   VITE_STAFF_AUTH_MODE=cloudflare-access
   VITE_API_BASE_URL=https://api.dragonfly.example.com
   ```

Once Access is in front, every request that reaches the Worker carries
`Cf-Access-Authenticated-User-Email` and `Cf-Access-Jwt-Assertion`. The
`requireStaffAccess` middleware in `workers/api/src/auth.ts` reads the
email as the audited actor identity, asserts the JWT `aud` against
`CF_ACCESS_AUD`, and lets the request through. `aud` mismatches and
absent headers both return 401.

For **local development** there is no Access in front of `localhost`.
Use the explicit shared-secret bypass:

```bash
# workers/api/.dev.vars
STAFF_LOCAL_SECRET="dev-only-please-rotate-me"
```

```bash
# apps/provider-web/.env.local (default if unset)
VITE_STAFF_AUTH_MODE=local-dev
```

The dashboard prompts for the secret at sign-in, stores it in
`sessionStorage` for the tab, and sends it on every staff request as
`X-Staff-Local-Secret`. Audit rows mark these requests with
`actor_id = "local-dev"`. Production Workers must leave
`STAFF_LOCAL_SECRET` unset — its presence is what enables the bypass.

## Running services behind the tunnel

`config.yml` for a multi-service tunnel that proxies a Mongo-adjacent
admin endpoint and a future BASTION ingest service:

```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: bastion-ingest.dragonfly.example.com
    service: http://localhost:9100
  - hostname: mongo-admin.dragonfly.example.com
    service: http://localhost:27017
    originRequest:
      proxyType: socks
  - service: http_status:404
```

Treat `cloudflared` as the secure tunnel layer for whatever you self-host
later. The Workers above keep running on Cloudflare's edge and need
nothing from `cloudflared` to be reachable.

## Self-hosted coturn for telemed

The telemed Worker reads ICE config from env and defaults to **no
third-party STUN/TURN**. To remove all third-party touchpoints from
telemed, run coturn on a small VPS and front it with `cloudflared`:

```bash
# /etc/turnserver.conf (excerpt)
listening-port=3478
fingerprint
lt-cred-mech
realm=turn.dragonfly.example.com
user=dragonfly:<long-random>
no-cli
no-tls       # TLS termination is handled by Cloudflare
```

```yaml
# ~/.cloudflared/config.yml
tunnel: <tunnel-id>
ingress:
  - hostname: turn.dragonfly.example.com
    service: tcp://localhost:3478
  - service: http_status:404
```

Then point the telemed Worker at it:

```bash
cd apps/telemed
wrangler secret put TURN_USERNAME       # dragonfly
wrangler secret put TURN_CREDENTIAL     # the long-random above
# In wrangler.toml:
#   STUN_URLS = "stun:turn.dragonfly.example.com:3478"
#   TURN_URLS = "turn:turn.dragonfly.example.com:3478?transport=tcp"
```

For local development, set those same vars in
`apps/telemed/.dev.vars` (gitignored) before running
`npm run dev:telemed`.
