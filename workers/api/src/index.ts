import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import { patientsRoute } from "./routes/patients.js";
import { glucoseRoute } from "./routes/glucose.js";
import { mealsRoute } from "./routes/meals.js";
import { telemedRoute } from "./routes/telemed.js";
import { providerRoute } from "./routes/provider.js";
import { authRoute } from "./routes/auth.js";
import { uploadsRoute } from "./routes/uploads.js";
import { auditRoute } from "./routes/audit.js";
import { provisioningRoute } from "./routes/provisioning.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (allowed.length === 0) return origin;
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Provisioning-Secret",
      "X-Staff-Local-Secret",
      "Cf-Access-Jwt-Assertion",
      "Cf-Access-Authenticated-User-Email",
    ],
    exposeHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  })(c, next);
});

app.get("/", (c) =>
  c.json({
    service: "dragonfly-api",
    status: "ok",
    note: "Privacy-first clinical research workflow scaffold — not HIPAA-compliant.",
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoute);
app.route("/api/patients", patientsRoute);
app.route("/api/glucose", glucoseRoute);
app.route("/api/meals", mealsRoute);
app.route("/api/telemed", telemedRoute);
app.route("/api/provider", providerRoute);
app.route("/api/uploads", uploadsRoute);
app.route("/api/audit", auditRoute);
app.route("/api/provisioning", provisioningRoute);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("api error", err);
  return c.json({ error: "Internal error" }, 500);
});

export default app;
