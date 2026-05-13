import { Hono } from "hono";
import { PROVIDER_TASK_STATES } from "@dragonfly/shared";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";
import { requireStaffAccess, type StaffPrincipal } from "../auth.js";

export const providerRoute = new Hono<{ Bindings: Env; Variables: { staff?: StaffPrincipal } }>();

// Every route under /api/provider is staff-only. Production deployments
// front the Worker with Cloudflare Access; local dev uses STAFF_LOCAL_SECRET.
providerRoute.use("*", requireStaffAccess);

providerRoute.get("/queue", async (c) => {
  const repo = await getRepo(c.env);
  return c.json(await repo.getProviderQueue());
});

providerRoute.get("/tasks", async (c) => {
  const patientId = c.req.query("patientId");
  if (!patientId) return c.json({ error: "patientId is required" }, 400);
  const repo = await getRepo(c.env);
  return c.json(await repo.listOpenTasks(patientId));
});

providerRoute.post("/tasks", async (c) => {
  const repo = await getRepo(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { patientId?: string; title?: string };
  if (!body.patientId || !body.title) {
    return c.json({ error: "patientId and title are required" }, 400);
  }
  const task = await repo.createProviderTask(body.patientId, body.title);
  return c.json(task, 201);
});

providerRoute.patch("/tasks/:id", async (c) => {
  const repo = await getRepo(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { state?: string };
  if (!body.state || !PROVIDER_TASK_STATES.includes(body.state as (typeof PROVIDER_TASK_STATES)[number])) {
    return c.json({ error: `state must be one of ${PROVIDER_TASK_STATES.join("|")}` }, 400);
  }
  const updated = await repo.updateProviderTaskState(
    c.req.param("id"),
    body.state as (typeof PROVIDER_TASK_STATES)[number],
  );
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});
