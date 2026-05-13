# Patient PWA

Mobile-first installable PWA for participants in the Diabetes Taiyi
Intervention Pilot Study. Built with Vite + React + TypeScript and styled
from `design/DESIGN.md`.

## Run locally

```bash
# from repo root
npm install
npm run dev:patient   # http://localhost:5173
```

The Worker API must be running too:

```bash
npm run dev:api       # http://localhost:8787
```

Sample study IDs you can log in with against the seeded in-memory repo:

- `TY-0001` — Mei Chen
- `TY-0002` — Robert Alvarez
- `TY-0003` — Aiko Tanaka

## Routes

- `/login` — study ID activation
- `/` — patient dashboard
- `/log` — log glucose
- `/food` — food diary
- `/telemed` — telemedicine entry (links into `apps/telemed`)
- `/profile` — study/profile info, sign out
- `/bridge` — sensor bridge token install + demo reading

## Sensor bridge runtime

`src/bridge/index.ts` is a runtime dispatcher that returns one of two
`BridgeAdapter` implementations:

- **`NativeBridgeAdapter`** — selected when an iOS / Android shell has
  injected `window.DragonflyBridge` and it satisfies the
  `NativeBridgeHost` surface. The bridge token lives in the platform
  secure store (Keychain / EncryptedSharedPreferences); the WebView
  never sees the raw token after install.
- **`WebBridgeAdapter`** — the web demo simulator. Stores the token in
  `localStorage` and emits honestly-tagged synthetic readings
  (`Dragonfly Demo Bridge`, `vendor: unknown`, `source: manual`)
  through the same authenticated `/api/glucose/sync` path a native
  bridge would use. This is what the `/bridge` screen exercises in dev
  and what `docs/DEMO.md` walks through.

The screen banner shows which backend is active. The exact JS contract
a native shell must implement is in
[`native/sensor-bridge/README.md`](../../native/sensor-bridge/README.md)
§ "Web ↔ native contract".

## Notes

- Auth is intentionally a study-ID lookup. Real participant auth is deferred.
- Photo uploads in the food diary use the R2-backed signed-URL path on
  `POST /api/uploads/sign`.
