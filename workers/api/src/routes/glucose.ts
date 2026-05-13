import { Hono } from "hono";
import {
  validateGlucoseSyncBatch,
  validateNewGlucoseReading,
  type GlucoseSyncResult,
} from "@dragonfly/shared";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";
import { resolveBridgeToken } from "../auth.js";
import { audit } from "../audit.js";
import { sha256Hex } from "../sign.js";

export const glucoseRoute = new Hono<{ Bindings: Env }>();

glucoseRoute.get("/", async (c) => {
  const patientId = c.req.query("patientId");
  if (!patientId) return c.json({ error: "patientId is required" }, 400);
  const repo = await getRepo(c.env);
  const limit = Number(c.req.query("limit") ?? 100);
  return c.json(await repo.listGlucoseForPatient(patientId, limit));
});

glucoseRoute.post("/", async (c) => {
  const repo = await getRepo(c.env);
  const body = await c.req.json().catch(() => null);
  const result = validateNewGlucoseReading(body);
  if (!result.ok) return c.json({ error: "Invalid reading", details: result.errors }, 400);
  const reading = await repo.addGlucoseReading(result.value);
  return c.json(reading, 201);
});

// Native sensor bridge upload. Accepts a batch of readings normalized by the
// iOS/Android adapters and persists them idempotently. Bridges may retry on
// network failure — the (rawDeviceId, timestamp) dedup key keeps replays safe.
//
// Auth: requires `Authorization: Bearer <bridge-token>`. The token is
// minted by `POST /api/auth/bridge-token` and pinned to a patientId. The
// patientId on the batch (and on every reading) must match the token's
// patientId — no cross-patient writes are allowed.
glucoseRoute.post("/sync", async (c) => {
  const repo = await getRepo(c.env);
  const tokenPatientId = await resolveBridgeToken(c);
  // For audit, derive a short hash prefix of whatever was offered so we
  // can correlate logs without ever storing the raw token.
  const rawAuth = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const actorId = rawAuth ? (await sha256Hex(rawAuth)).slice(0, 12) : undefined;

  if (!tokenPatientId) {
    await audit(repo, {
      actorKind: "bridge",
      actorId,
      eventType: "glucose.sync.denied",
      targetKind: "glucose_batch",
      outcome: "denied",
      detail: "missing or unknown token",
    });
    return c.json({ error: "Unauthorized — bridge bearer token required" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const batch = validateGlucoseSyncBatch(body);
  if (!batch.ok) {
    await audit(repo, {
      actorKind: "bridge",
      actorId,
      eventType: "glucose.sync.invalid",
      targetKind: "patient",
      targetId: tokenPatientId,
      outcome: "invalid",
      detail: batch.errors.slice(0, 3).join("; "),
    });
    return c.json({ error: "Invalid batch", details: batch.errors }, 400);
  }

  if (batch.value.patientId !== tokenPatientId) {
    await audit(repo, {
      actorKind: "bridge",
      actorId,
      eventType: "glucose.sync.denied",
      targetKind: "patient",
      targetId: tokenPatientId,
      outcome: "denied",
      detail: "patientId mismatch",
    });
    return c.json({ error: "Token does not authorize this patientId" }, 403);
  }

  const result: GlucoseSyncResult = { accepted: 0, duplicates: 0, rejected: [] };
  for (let i = 0; i < batch.value.readings.length; i++) {
    const raw = batch.value.readings[i];
    // Bridge defaults: every reading in a sync batch belongs to the batch's
    // patient and inherits the batch's vendor/device unless the bridge
    // explicitly overrode them per-reading. We also force the patientId
    // back to the token's patientId so a malicious or buggy bridge can't
    // smuggle readings into another participant's record.
    const merged = {
      ...raw,
      patientId: tokenPatientId,
      vendor: raw.vendor ?? batch.value.vendor,
      deviceName: raw.deviceName ?? batch.value.deviceName,
      source: raw.source ?? "cgm",
    };
    const validated = validateNewGlucoseReading(merged);
    if (!validated.ok) {
      result.rejected.push({ index: i, reason: validated.errors.join("; ") });
      continue;
    }
    const inserted = await repo.addGlucoseReadingIfNew(validated.value);
    if (inserted) result.accepted += 1;
    else result.duplicates += 1;
  }
  await audit(repo, {
    actorKind: "bridge",
    actorId,
    eventType: "glucose.sync.accepted",
    targetKind: "patient",
    targetId: tokenPatientId,
    outcome: "ok",
    detail: `accepted=${result.accepted} duplicates=${result.duplicates} rejected=${result.rejected.length}`,
  });
  return c.json(result, 200);
});
