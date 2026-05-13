// Adapted from /home/dream/Documents/meet/src/index.ts.
// Stripped to the telemedicine essentials: serve static UI, mint room IDs,
// proxy WebSocket upgrades into the per-room Durable Object. Admin auth,
// email routing, and rate limiting from the source project are intentionally
// out of scope for the pilot — they rely on bindings we do not carry over.

import { Room } from "./room.js";

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  // Operator-supplied ICE config. STUN_URLS and TURN_URLS are
  // comma-separated lists; TURN credentials are optional (only required
  // for TURN entries that need auth). When all three are empty the
  // Worker returns an empty iceServers array — the client will then
  // fall back to direct connection only (works on permissive networks,
  // not on symmetric NATs). See docs/CLOUDFLARED.md for the
  // self-hosted coturn pattern.
  STUN_URLS?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
}

const MAX_ROOM_ID_LENGTH = 32;
const ROOM_ID_RE = /^[a-z0-9-]+$/i;

function randomRoomId(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function validRoomId(roomId: string): boolean {
  return roomId.length > 0 && roomId.length <= MAX_ROOM_ID_LENGTH && ROOM_ID_RE.test(roomId);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // /ws/<roomId> — WebSocket signaling forwarded to the Durable Object.
    if (path.startsWith("/ws/")) {
      const roomId = path.slice("/ws/".length);
      if (!validRoomId(roomId)) return new Response("Invalid room id", { status: 400 });
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      return stub.fetch(request);
    }

    // /new — mint a new room and redirect.
    if (path === "/new") {
      const id = randomRoomId();
      url.pathname = `/r/${id}`;
      return Response.redirect(url.toString(), 302);
    }

    // /r/<roomId> — serve the room UI (validated, then rewrites to /room.html).
    if (path.startsWith("/r/")) {
      const roomId = path.slice("/r/".length);
      if (!validRoomId(roomId)) return new Response("Invalid room id", { status: 400 });
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/room.html";
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    // /api/health for status checks.
    if (path === "/api/health") {
      return Response.json({ ok: true, service: "dragonfly-telemed" });
    }

    // /api/ice — operator-controlled ICE server list. The room client
    // fetches this on startup. No third-party defaults are baked in;
    // when the env is empty, no servers are returned.
    if (path === "/api/ice") {
      type IceServer = { urls: string | string[]; username?: string; credential?: string };
      const stun = (env.STUN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const turn = (env.TURN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const iceServers: IceServer[] = [];
      for (const u of stun) iceServers.push({ urls: u });
      if (turn.length > 0) {
        const turnEntry: IceServer = { urls: turn };
        if (env.TURN_USERNAME) turnEntry.username = env.TURN_USERNAME;
        if (env.TURN_CREDENTIAL) turnEntry.credential = env.TURN_CREDENTIAL;
        iceServers.push(turnEntry);
      }
      return Response.json(
        { iceServers },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // Fall through to static assets (landing page, room.js).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export { Room } from "./room.js";
