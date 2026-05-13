import { Hono } from "hono";
import { validateNewPatient } from "@dragonfly/shared";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";
import { audit } from "../audit.js";
import { requireStaffAccess, type StaffPrincipal } from "../auth.js";

export const patientsRoute = new Hono<{ Bindings: Env; Variables: { staff?: StaffPrincipal } }>();

patientsRoute.get("/", async (c) => {
  const repo = await getRepo(c.env);
  return c.json(await repo.listPatients());
});

patientsRoute.post("/", async (c) => {
  const repo = await getRepo(c.env);
  const body = await c.req.json().catch(() => null);
  const result = validateNewPatient(body);
  if (!result.ok) return c.json({ error: "Invalid patient", details: result.errors }, 400);
  const patient = await repo.createPatient(result.value);
  return c.json(patient, 201);
});

patientsRoute.get("/:id", async (c) => {
  const repo = await getRepo(c.env);
  const p = await repo.getPatient(c.req.param("id"));
  if (!p) return c.json({ error: "Not found" }, 404);
  return c.json(p);
});

patientsRoute.get("/by-enrollment/:enrollmentId", async (c) => {
  const repo = await getRepo(c.env);
  const p = await repo.getPatientByEnrollmentId(c.req.param("enrollmentId"));
  if (!p) return c.json({ error: "Not found" }, 404);
  return c.json(p);
});

patientsRoute.get("/:id/overview", requireStaffAccess, async (c) => {
  const repo = await getRepo(c.env);
  const patientId = c.req.param("id")!;
  const staff = c.get("staff");
  const overview = await repo.getPatientOverview(patientId);
  if (!overview) {
    await audit(repo, {
      actorKind: "provider",
      actorId: staff?.id,
      eventType: "patient.viewed",
      targetKind: "patient",
      targetId: patientId,
      outcome: "denied",
      detail: `not found via=${staff?.via ?? "none"}`,
    });
    return c.json({ error: "Not found" }, 404);
  }
  await audit(repo, {
    actorKind: "provider",
    actorId: staff?.id,
    eventType: "patient.viewed",
    targetKind: "patient",
    targetId: patientId,
    outcome: "ok",
    detail: `via=${staff?.via ?? "none"}`,
  });
  return c.json(overview);
});
