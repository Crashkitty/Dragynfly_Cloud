export interface Env {
  // CORS allow-list (comma separated).
  ALLOWED_ORIGINS?: string;

  // Cloudflare D1 — primary persistence. When unbound, the Worker falls
  // back to MemoryRepo (dev only).
  DB?: D1Database;

  // R2 bucket for meal/glucose evidence media. When unbound, the upload
  // routes return 503.
  MEDIA?: R2Bucket;

  // HMAC key used to sign R2 upload/download URLs. Required when MEDIA is
  // bound. Set with `wrangler secret put UPLOAD_SIGNING_SECRET`.
  UPLOAD_SIGNING_SECRET?: string;

  // Coordinator-only secret required to mint bridge bearer tokens.
  // Set with `wrangler secret put BRIDGE_PROVISIONING_SECRET`.
  BRIDGE_PROVISIONING_SECRET?: string;

  // Cloudflare Access AUD (application audience tag). When present, the
  // staff middleware additionally requires the request to carry a
  // `Cf-Access-Jwt-Assertion` header whose payload includes this aud. In
  // V1 we do not verify the JWT signature in the Worker — Cloudflare Access
  // enforces that at the edge before the request reaches us. The aud check
  // is a defence-in-depth assertion that we are still behind the right
  // Access application.
  //
  // If unset, the Worker only checks for the presence of
  // `Cf-Access-Authenticated-User-Email` (still set by Access) or, in
  // local dev, the STAFF_LOCAL_SECRET fallback below.
  CF_ACCESS_AUD?: string;

  // Local-development shared secret for staff endpoints. ONLY honoured
  // when set; production deployments must leave this unset and rely on
  // Cloudflare Access at the edge. Requests bypass the Access check by
  // sending `X-Staff-Local-Secret: <value>`. The audit log marks the
  // actor as `local-dev` so these requests are visible.
  STAFF_LOCAL_SECRET?: string;

  // Reserved for future MongoDB adapter; not used in V1.
  MONGODB_URI?: string;
  MONGODB_DB?: string;
}
