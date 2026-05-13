import { Hono } from "hono";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";
import { audit } from "../audit.js";
import { requireStaffAccess, type StaffPrincipal } from "../auth.js";
import type { AuditFilter } from "../repo/types.js";
import type { NewAuditEvent } from "../repo/types.js";

export const auditRoute = new Hono<{ Bindings: Env; Variables: { staff?: StaffPrincipal } }>();

auditRoute.use("*", requireStaffAccess);

const ALLOWED_ACTOR_KINDS = ["provider", "patient", "bridge", "coordinator", "system"] as const;
const ALLOWED_TARGET_KINDS = ["patient", "glucose_batch", "upload", "telemed_session", "task"] as const;

// Operational review surface for staff. Returns recent audit rows with
// optional filters; the row shape is the same the repo persists, so the
// privacy rule from `docs/AUDIT_LOG.md` carries through unmodified — the
// route does not enrich rows with PHI.
//
// Filters are conservative on purpose: we only honour fields that already
// have indexes (`event_type`, `target_kind`+`target_id`) plus `actor_kind`,
// and cap `limit` at 500. Free-text search would require either scanning
// `detail` or building an FTS index, both of which we deliberately skip in
// V1 — `detail` is opaque and the row count is small.
auditRoute.get("/", async (c) => {
  const repo = await getRepo(c.env);
  const staff = c.get("staff");
  const filter: AuditFilter = {
    eventType: c.req.query("eventType") || undefined,
    actorKind: pickActorKind(c.req.query("actorKind")),
    targetKind: pickTargetKind(c.req.query("targetKind")),
    targetId: c.req.query("targetId") || undefined,
    limit: parseLimit(c.req.query("limit")),
  };
  const events = await repo.listAuditEvents(filter);
  await audit(repo, {
    actorKind: "provider",
    actorId: staff?.id,
    eventType: "audit.viewed",
    outcome: "ok",
    detail: `n=${events.length} via=${staff?.via ?? "none"}`,
  });
  return c.json(events);
});

function pickActorKind(v: string | undefined): NewAuditEvent["actorKind"] | undefined {
  if (!v) return undefined;
  return (ALLOWED_ACTOR_KINDS as readonly string[]).includes(v)
    ? (v as NewAuditEvent["actorKind"])
    : undefined;
}

function pickTargetKind(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return (ALLOWED_TARGET_KINDS as readonly string[]).includes(v) ? v : undefined;
}

function parseLimit(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), 500);
}
