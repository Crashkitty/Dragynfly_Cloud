import type { Context } from "hono";
import type { Env } from "./env.js";
import { getRepo } from "./repo/index.js";
import { sha256Hex } from "./sign.js";

// Resolves a bearer token from the Authorization header to a patientId
// using the bridge_tokens table. Returns null on any failure.
export async function resolveBridgeToken(
  c: Context<{ Bindings: Env }>,
): Promise<string | null> {
  const header = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  const tokenHash = await sha256Hex(raw);
  const repo = await getRepo(c.env);
  return repo.patientForBridgeTokenHash(tokenHash);
}

// Hono middleware: requires a coordinator-only provisioning secret.
// Used to gate POST /api/auth/bridge-token so only operators with the
// secret can mint bridge tokens for participants.
export async function requireProvisioningSecret(
  c: Context<{ Bindings: Env }>,
  next: () => Promise<void>,
): Promise<Response | void> {
  const required = c.env.BRIDGE_PROVISIONING_SECRET;
  if (!required) {
    return c.json(
      { error: "BRIDGE_PROVISIONING_SECRET is not configured on this Worker" },
      503,
    );
  }
  const provided =
    c.req.header("x-provisioning-secret") ?? c.req.header("X-Provisioning-Secret");
  if (!provided || provided !== required) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
}

export interface StaffPrincipal {
  /** Stable identifier for audit. Email when via Access; "local-dev" otherwise. */
  id: string;
  /** Path used to authenticate this request — informational, audited. */
  via: "cloudflare-access" | "local-dev";
}

// Hono middleware: gates staff-only routes (provider queue, patient
// overview, audit listing). Production deployments are expected to sit
// behind Cloudflare Access, which injects:
//
//   Cf-Access-Authenticated-User-Email: <staff@example.com>
//   Cf-Access-Jwt-Assertion: <jwt>
//
// The Worker treats those headers as the source of truth; their presence
// proves Access let the request through. We additionally assert
// `aud === CF_ACCESS_AUD` from the JWT payload (no signature check —
// Access already verified) so a misrouted request from another Access
// app cannot be honoured.
//
// For local development we honour `X-Staff-Local-Secret` matching
// `STAFF_LOCAL_SECRET`. This is intentionally explicit: the variable
// must be set per-environment and the request must include the matching
// header. Production Workers MUST NOT have STAFF_LOCAL_SECRET configured.
//
// On success, the principal is stashed on the context as `staff`.
export async function requireStaffAccess(
  c: Context<{ Bindings: Env; Variables: { staff?: StaffPrincipal } }>,
  next: () => Promise<void>,
): Promise<Response | void> {
  const accessEmail =
    c.req.header("cf-access-authenticated-user-email") ??
    c.req.header("Cf-Access-Authenticated-User-Email");
  const accessJwt =
    c.req.header("cf-access-jwt-assertion") ??
    c.req.header("Cf-Access-Jwt-Assertion");

  if (accessEmail) {
    if (c.env.CF_ACCESS_AUD) {
      const aud = audFromJwt(accessJwt);
      if (!aud || !audMatches(aud, c.env.CF_ACCESS_AUD)) {
        return c.json({ error: "Unauthorized — Access aud mismatch" }, 401);
      }
    }
    c.set("staff", { id: accessEmail, via: "cloudflare-access" });
    await next();
    return;
  }

  const localSecret = c.env.STAFF_LOCAL_SECRET;
  if (localSecret) {
    const provided =
      c.req.header("x-staff-local-secret") ?? c.req.header("X-Staff-Local-Secret");
    if (provided && provided === localSecret) {
      c.set("staff", { id: "local-dev", via: "local-dev" });
      await next();
      return;
    }
  }

  return c.json(
    {
      error:
        "Unauthorized — staff surface. Production: front this Worker with Cloudflare Access. Local dev: set STAFF_LOCAL_SECRET and send X-Staff-Local-Secret.",
    },
    401,
  );
}

// Pulls the `aud` claim out of an unverified Access JWT. We rely on
// Access at the edge for signature verification; this is a structural
// check to make sure we're behind the application we expect.
function audFromJwt(jwt: string | undefined): string | string[] | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(b64urlDecode(parts[1])) as { aud?: string | string[] };
    return payload.aud ?? null;
  } catch {
    return null;
  }
}

function audMatches(aud: string | string[], expected: string): boolean {
  if (Array.isArray(aud)) return aud.includes(expected);
  return aud === expected;
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}
