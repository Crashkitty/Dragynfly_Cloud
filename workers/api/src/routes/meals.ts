import { Hono } from "hono";
import { validateNewMealEntry } from "@dragonfly/shared";
import type { Env } from "../env.js";
import { getRepo } from "../repo/index.js";

export const mealsRoute = new Hono<{ Bindings: Env }>();

mealsRoute.get("/", async (c) => {
  const patientId = c.req.query("patientId");
  if (!patientId) return c.json({ error: "patientId is required" }, 400);
  const repo = await getRepo(c.env);
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json(await repo.listMealsForPatient(patientId, limit));
});

mealsRoute.post("/", async (c) => {
  const repo = await getRepo(c.env);
  const body = await c.req.json().catch(() => null);
  const result = validateNewMealEntry(body);
  if (!result.ok) return c.json({ error: "Invalid meal", details: result.errors }, 400);
  const meal = await repo.addMealEntry(result.value);
  return c.json(meal, 201);
});
