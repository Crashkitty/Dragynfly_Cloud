// Staff auth — provider-web is a staff-only surface.
//
// Production: this app is meant to sit behind Cloudflare Access. Access
// authenticates the operator at the edge, then forwards the request with
// `Cf-Access-Authenticated-User-Email` and `Cf-Access-Jwt-Assertion`. The
// browser session is established by the Access cookie that Cloudflare
// itself manages — this file does not implement OIDC or session cookies.
//
// Local dev: there is no Access in front of `localhost:5174`. The operator
// enters a shared `STAFF_LOCAL_SECRET` (the same value the Worker has in
// `.dev.vars`). The secret is held in `sessionStorage` so it doesn't
// outlive the tab and is sent on every request as `X-Staff-Local-Secret`.
//
// Mode is decided by `VITE_STAFF_AUTH_MODE`:
//   - "cloudflare-access" (default for production builds): assume Access
//     is in front; do not present a local-secret prompt.
//   - "local-dev"                                       : show the prompt.
//
// We deliberately do not fake an enterprise IdP. There is no JWT issued
// by this app, no OIDC redirect, no email/password flow. The two trust
// paths above are the only ones supported.

const KEY = "dragonfly.staffLocalSecret";

export type StaffAuthMode = "cloudflare-access" | "local-dev";

export function staffAuthMode(): StaffAuthMode {
  const raw = (import.meta.env.VITE_STAFF_AUTH_MODE as string | undefined) ?? "local-dev";
  return raw === "cloudflare-access" ? "cloudflare-access" : "local-dev";
}

export function getLocalSecret(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(KEY);
}

export function setLocalSecret(value: string): void {
  sessionStorage.setItem(KEY, value);
}

export function clearLocalSecret(): void {
  sessionStorage.removeItem(KEY);
}

// True when the app has *something* to send on staff requests:
// - cloudflare-access mode: always yes (Access is upstream)
// - local-dev mode        : yes iff the operator has entered a secret
export function isStaffAuthReady(): boolean {
  if (staffAuthMode() === "cloudflare-access") return true;
  return getLocalSecret() !== null;
}

// Returns the headers the API client should add on every staff request.
// In cloudflare-access mode this is empty — the Access-issued cookie is
// already on the request and CF injects the headers for us.
export function staffAuthHeaders(): Record<string, string> {
  if (staffAuthMode() === "cloudflare-access") return {};
  const secret = getLocalSecret();
  return secret ? { "X-Staff-Local-Secret": secret } : {};
}
