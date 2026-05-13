import { Hono } from "hono";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";
import { randomToken, sha256Hex } from "../sign.js";
import { requireProvisioningSecret } from "../auth.js";

export const authRoute = new Hono<{ Bindings: Env }>();

// POST /api/auth/bridge-token
//   Headers: X-Provisioning-Secret: <BRIDGE_PROVISIONING_SECRET>
//   Body:    { patientId: string, label?: string }
//
// Returns { token } once. The raw token is never persisted — only its
// SHA-256 hash. Coordinators install the token on the patient's device by
// any out-of-band channel they prefer (paper handoff, QR, encrypted email).
authRoute.post("/bridge-token", requireProvisioningSecret, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    patientId?: string;
    label?: string;
  };
  if (!body.patientId) {
    return c.json({ error: "patientId is required" }, 400);
  }
  const repo = await getRepo(c.env);
  const patient = await repo.getPatient(body.patientId);
  if (!patient) return c.json({ error: "Patient not found" }, 404);

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  await repo.storeBridgeTokenHash(tokenHash, body.patientId, body.label);
  return c.json({
    patientId: body.patientId,
    label: body.label,
    token,
    note:
      "This token is shown once. Install it on the patient's device and discard the response. The Worker only retains a SHA-256 hash.",
  }, 201);
});
