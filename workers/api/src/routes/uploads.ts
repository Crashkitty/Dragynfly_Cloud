import { Hono } from "hono";
import type { Env } from "../env.js";
import { signMessage, verifyMessage } from "../sign.js";
import { getRepo } from "../repo/index.js";
import { audit } from "../audit.js";

// Signed R2 upload/download flow.
//
// Trust boundary: the only way for a client to PUT or GET an object is to
// hold a Worker-signed URL. The R2 bucket is private and never exposed
// directly. Signatures are HMAC-SHA-256 over `${op}|${key}|${exp}`.
//
//  POST /api/uploads/sign
//    body: { kind, patientId, contentType, filename }
//    → { key, putUrl, getUrl }    (both URLs are absolute paths under /api/uploads/)
//
//  PUT /api/uploads/<key>?op=put&exp&sig
//    body: file bytes
//    → { ok: true, key }
//
//  GET /api/uploads/<key>?op=get&exp&sig
//    → 200 with object body and original Content-Type

export const uploadsRoute = new Hono<{ Bindings: Env }>();

const ALLOWED_KINDS = new Set(["meal_photo", "glucose_evidence", "consent_doc"]);
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const PUT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const GET_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function safeFilename(name: string): string {
  const trimmed = name.split(/[\\/]/).pop() ?? "file";
  return trimmed.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 80) || "file";
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function requireMedia(c: { env: Env; json: any }): Response | null {
  if (!c.env.MEDIA) {
    return c.json(
      { error: "MEDIA bucket binding is not configured on this Worker" },
      503,
    ) as Response;
  }
  if (!c.env.UPLOAD_SIGNING_SECRET) {
    return c.json(
      { error: "UPLOAD_SIGNING_SECRET is not configured on this Worker" },
      503,
    ) as Response;
  }
  return null;
}

uploadsRoute.post("/sign", async (c) => {
  const fail = requireMedia(c);
  if (fail) return fail;

  const body = (await c.req.json().catch(() => ({}))) as {
    kind?: string;
    patientId?: string;
    contentType?: string;
    filename?: string;
  };
  if (!body.kind || !ALLOWED_KINDS.has(body.kind)) {
    return c.json({ error: `kind must be one of ${[...ALLOWED_KINDS].join("|")}` }, 400);
  }
  if (!body.patientId || typeof body.patientId !== "string") {
    return c.json({ error: "patientId is required" }, 400);
  }
  if (!body.contentType || !ALLOWED_CONTENT_TYPES.has(body.contentType)) {
    return c.json(
      { error: `contentType must be one of ${[...ALLOWED_CONTENT_TYPES].join(", ")}` },
      400,
    );
  }
  const fname = safeFilename(body.filename ?? "upload");
  const key = `${body.kind}/${encodeURIComponent(body.patientId)}/${randomId()}-${fname}`;
  const now = Date.now();
  const putExp = now + PUT_TTL_MS;
  const getExp = now + GET_TTL_MS;
  const secret = c.env.UPLOAD_SIGNING_SECRET!;
  const putSig = await signMessage(secret, `put|${key}|${putExp}`);
  const getSig = await signMessage(secret, `get|${key}|${getExp}`);

  const putUrl = `/api/uploads/${key}?op=put&exp=${putExp}&sig=${encodeURIComponent(putSig)}&ct=${encodeURIComponent(body.contentType)}`;
  const getUrl = `/api/uploads/${key}?op=get&exp=${getExp}&sig=${encodeURIComponent(getSig)}`;
  const repo = await getRepo(c.env);
  await audit(repo, {
    actorKind: "patient",
    actorId: body.patientId,
    eventType: "upload.signed",
    targetKind: "upload",
    targetId: key,
    outcome: "ok",
    detail: `kind=${body.kind} ct=${body.contentType}`,
  });
  return c.json({ key, putUrl, getUrl, putExpiresAt: new Date(putExp).toISOString(), getExpiresAt: new Date(getExp).toISOString() });
});

// Capture-all PUT for `/api/uploads/<...key>?op=put&exp&sig&ct`.
uploadsRoute.put("/*", async (c) => {
  const fail = requireMedia(c);
  if (fail) return fail;

  const path = c.req.path; // e.g. /api/uploads/meal_photo/p1/abc.jpg
  const prefix = "/api/uploads/";
  if (!path.startsWith(prefix)) return c.json({ error: "Bad path" }, 400);
  const key = path.slice(prefix.length);
  if (!key) return c.json({ error: "Missing key" }, 400);

  const op = c.req.query("op");
  const exp = Number(c.req.query("exp") ?? 0);
  const sig = c.req.query("sig") ?? "";
  const ct = c.req.query("ct") ?? "application/octet-stream";

  if (op !== "put") return c.json({ error: "Bad op" }, 400);
  if (!Number.isFinite(exp) || Date.now() > exp) {
    return c.json({ error: "Signature expired" }, 401);
  }
  const ok = await verifyMessage(c.env.UPLOAD_SIGNING_SECRET!, `put|${key}|${exp}`, sig);
  if (!ok) return c.json({ error: "Bad signature" }, 401);

  if (!ALLOWED_CONTENT_TYPES.has(ct)) return c.json({ error: "Disallowed content type" }, 415);
  const cl = Number(c.req.header("content-length") ?? 0);
  if (cl > MAX_BYTES) return c.json({ error: "Payload too large" }, 413);

  // Refuse overwrites — keys are random, so any collision is suspicious.
  const existing = await c.env.MEDIA!.head(key);
  if (existing) return c.json({ error: "Key already exists" }, 409);

  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return c.json({ error: "Payload too large" }, 413);

  await c.env.MEDIA!.put(key, body, { httpMetadata: { contentType: ct } });
  return c.json({ ok: true, key });
});

// Capture-all GET for `/api/uploads/<...key>?op=get&exp&sig`.
uploadsRoute.get("/*", async (c) => {
  const fail = requireMedia(c);
  if (fail) return fail;

  const path = c.req.path;
  const prefix = "/api/uploads/";
  if (!path.startsWith(prefix)) return c.json({ error: "Bad path" }, 400);
  const key = path.slice(prefix.length);
  if (!key) return c.json({ error: "Missing key" }, 400);

  const op = c.req.query("op");
  const exp = Number(c.req.query("exp") ?? 0);
  const sig = c.req.query("sig") ?? "";

  if (op !== "get") return c.json({ error: "Bad op" }, 400);
  if (!Number.isFinite(exp) || Date.now() > exp) {
    return c.json({ error: "Signature expired" }, 401);
  }
  const ok = await verifyMessage(c.env.UPLOAD_SIGNING_SECRET!, `get|${key}|${exp}`, sig);
  if (!ok) return c.json({ error: "Bad signature" }, 401);

  const obj = await c.env.MEDIA!.get(key);
  if (!obj) return c.json({ error: "Not found" }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=300");
  return new Response(obj.body, { headers });
});
