// Adapted from /home/dream/Documents/meet/src/room.ts.
// Slim Durable Object that fans out WebRTC signaling messages between peers
// in the same room. No persistence, no auth — V1 telemed is a guest-link
// pattern protected by random room IDs.

import { DurableObject } from "cloudflare:workers";

export interface Env {}

interface Client {
  id: string;
  socket: WebSocket;
}

const MAX_MESSAGE_LENGTH = 5000;
const MAX_NAME_LENGTH = 100;
const MAX_CLIENTS_PER_ROOM = 12; // pilot study sessions are 1:1 or small group

export class Room extends DurableObject<Env> {
  private clients: Map<string, Client> = new Map();

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (this.clients.size >= MAX_CLIENTS_PER_ROOM) {
      return new Response("Room is full", { status: 429 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.handle(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private sanitize(input: unknown, maxLength: number): string {
    if (typeof input !== "string") return "";
    return input.slice(0, maxLength).trim();
  }

  private handle(ws: WebSocket): void {
    const clientId = crypto.randomUUID();
    this.clients.set(clientId, { id: clientId, socket: ws });
    ws.accept();

    ws.addEventListener("message", (event) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (!payload || typeof payload !== "object") return;

      if (payload.type === "chat" && typeof payload.message === "string") {
        payload.message = this.sanitize(payload.message, MAX_MESSAGE_LENGTH);
        if (!payload.message) return;
      }
      if (typeof payload.name === "string") {
        payload.name = this.sanitize(payload.name, MAX_NAME_LENGTH);
      }

      // Always overwrite "from" so clients can't spoof other peers.
      payload.from = clientId;
      const data = JSON.stringify(payload);
      for (const [id, peer] of this.clients) {
        if (id === clientId) continue;
        try {
          peer.socket.send(data);
        } catch {
          // ignore broken peer sockets
        }
      }
    });

    const close = () => {
      this.clients.delete(clientId);
      try { ws.close(); } catch { /* ignore */ }
    };
    ws.addEventListener("close", close);
    ws.addEventListener("error", close);
  }
}
