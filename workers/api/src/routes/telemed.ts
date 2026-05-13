import { Hono } from "hono";
import { TELEMED_STATUSES, validateNewTelemedSession } from "@dragonfly/shared";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";
import { audit } from "../audit.js";

export const telemedRoute = new Hono<{ Bindings: Env }>();

function randomRoomId(): string {
  // 10 lowercase chars; matches the telemed Worker's accepted shape.
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

telemedRoute.get("/", async (c) => {
  const patientId = c.req.query("patientId");
  if (!patientId) return c.json({ error: "patientId is required" }, 400);
  const repo = await getRepo(c.env);
  return c.json(await repo.listTelemedForPatient(patientId));
});

telemedRoute.post("/", async (c) => {
  const repo = await getRepo(c.env);
  const body = await c.req.json().catch(() => null);
  const result = validateNewTelemedSession(body);
  if (!result.ok) return c.json({ error: "Invalid session", details: result.errors }, 400);
  const session = await repo.requestTelemedSession(result.value);
  await audit(repo, {
    actorKind: "patient",
    actorId: session.patientId,
    eventType: "telemed.session.created",
    targetKind: "telemed_session",
    targetId: session.id,
    outcome: "ok",
    detail: `channel=${session.channel}`,
  });
  return c.json(session, 201);
});

telemedRoute.patch("/:id/status", async (c) => {
  const repo = await getRepo(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { status?: string; roomId?: string };
  if (!body.status || !TELEMED_STATUSES.includes(body.status as (typeof TELEMED_STATUSES)[number])) {
    return c.json({ error: `status must be one of ${TELEMED_STATUSES.join("|")}` }, 400);
  }
  const updated = await repo.updateTelemedStatus(
    c.req.param("id"),
    body.status as (typeof TELEMED_STATUSES)[number],
    body.roomId,
  );
  if (!updated) return c.json({ error: "Not found" }, 404);
  await audit(repo, {
    actorKind: "provider",
    eventType: "telemed.session.updated",
    targetKind: "telemed_session",
    targetId: updated.id,
    outcome: "ok",
    detail: `status=${updated.status}${updated.roomId ? " room=" + updated.roomId : ""}`,
  });
  return c.json(updated);
});

// Mints a stable roomId on the session if one isn't already set, marks
// the session in_progress, and returns the session with its roomId.
// Both patient and provider apps call this so they end up in the same
// room. Idempotent: calling /start twice on the same session does not
// rotate the roomId.
telemedRoute.post("/:id/start", async (c) => {
  const repo = await getRepo(c.env);
  const sessionId = c.req.param("id");
  const existing = await repo.getTelemedSession(sessionId);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const roomId = existing.roomId ?? randomRoomId();
  const updated = await repo.updateTelemedStatus(sessionId, "in_progress", roomId);
  if (!updated) return c.json({ error: "Not found" }, 404);
  await audit(repo, {
    actorKind: "provider",
    eventType: "telemed.session.started",
    targetKind: "telemed_session",
    targetId: updated.id,
    outcome: "ok",
    detail: `room=${updated.roomId} reused=${existing.roomId ? "true" : "false"}`,
  });
  return c.json(updated);
});
