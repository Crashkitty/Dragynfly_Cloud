import { Hono } from "hono";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";
import { audit } from "../audit.js";
import { randomToken, sha256Hex } from "../sign.js";
import { requireStaffAccess, type StaffPrincipal } from "../auth.js";

export const provisioningRoute = new Hono<{
  Bindings: Env;
  Variables: { staff?: StaffPrincipal };
}>();

// Every route under /api/provisioning is the staff-facing operational
// surface for managing bridge tokens. Same trust path as the rest of
// /api/provider, /api/audit, and GET /api/patients/:id/overview.
provisioningRoute.use("*", requireStaffAccess);

// Mint a new bridge token for a patient. The raw token is shown ONCE
// in the response and never persisted — only its SHA-256 hex is. This is
// the staff-gated equivalent of POST /api/auth/bridge-token (which still
// exists for headless scripts using BRIDGE_PROVISIONING_SECRET).
provisioningRoute.post("/bridge-tokens", async (c) => {
  const repo = await getRepo(c.env);
  const staff = c.get("staff");
  const body = (await c.req.json().catch(() => ({}))) as {
    patientId?: string;
    label?: string;
  };
  if (!body.patientId) {
    return c.json({ error: "patientId is required" }, 400);
  }
  const patient = await repo.getPatient(body.patientId);
  if (!patient) {
    await audit(repo, {
      actorKind: "provider",
      actorId: staff?.id,
      eventType: "bridge_token.minted",
      targetKind: "patient",
      targetId: body.patientId,
      outcome: "denied",
      detail: `not found via=${staff?.via ?? "none"}`,
    });
    return c.json({ error: "Patient not found" }, 404);
  }

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const label = body.label?.trim() || undefined;
  await repo.storeBridgeTokenHash(tokenHash, body.patientId, label);

  await audit(repo, {
    actorKind: "provider",
    actorId: staff?.id,
    eventType: "bridge_token.minted",
    targetKind: "patient",
    targetId: body.patientId,
    outcome: "ok",
    detail: `prefix=${tokenHash.slice(0, 12)} via=${staff?.via ?? "none"}${label ? ` label=${label}` : ""}`,
  });
  return c.json(
    {
      patientId: body.patientId,
      label,
      hashPrefix: tokenHash.slice(0, 12),
      token,
      note:
        "This token is shown once. Hand it to the patient out-of-band; the Worker only retains a SHA-256 hash.",
    },
    201,
  );
});

// Inventory of issued tokens for a patient. Returns hash prefix +
// label + createdAt only — never the full hash, never anything that
// could be replayed.
provisioningRoute.get("/bridge-tokens", async (c) => {
  const patientId = c.req.query("patientId");
  if (!patientId) return c.json({ error: "patientId is required" }, 400);
  const repo = await getRepo(c.env);
  return c.json(await repo.listBridgeTokensForPatient(patientId));
});

// Revoke a single token by its 12-char hash prefix. The repo layer
// refuses ambiguous prefixes (zero or multiple matches) so a slip in
// the staff UI cannot silently revoke the wrong token.
provisioningRoute.delete("/bridge-tokens/:prefix", async (c) => {
  const repo = await getRepo(c.env);
  const staff = c.get("staff");
  const prefix = c.req.param("prefix") || "";
  const result = await repo.revokeBridgeTokenByHashPrefix(prefix);
  if (result.revoked !== 1) {
    await audit(repo, {
      actorKind: "provider",
      actorId: staff?.id,
      eventType: "bridge_token.revoke",
      outcome: "invalid",
      detail: `prefix=${prefix.slice(0, 12)} matches=${result.revoked} via=${staff?.via ?? "none"}`,
    });
    return c.json({ error: "No unique token matched that prefix." }, 404);
  }
  await audit(repo, {
    actorKind: "provider",
    actorId: staff?.id,
    eventType: "bridge_token.revoke",
    targetKind: "patient",
    targetId: result.patientId,
    outcome: "ok",
    detail: `prefix=${prefix.slice(0, 12)} via=${staff?.via ?? "none"}`,
  });
  return c.json({ revoked: 1, patientId: result.patientId });
});
