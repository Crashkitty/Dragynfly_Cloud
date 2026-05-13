import type { Repo } from "./repo/index.js";
import type { NewAuditEvent } from "./repo/types.js";

// Lightweight audit-log helper. Routes call this; failures are swallowed
// so a logging hiccup never breaks a clinical action. The repo owns
// persistence (D1 in production, in-memory in dev).
//
// Strict rule: do NOT pass raw PHI into `detail`. Counts, IDs, status
// codes, and short outcome strings are fine. Free-text patient input is
// not.
export async function audit(repo: Repo, event: NewAuditEvent): Promise<void> {
  try {
    await repo.addAuditEvent(event);
  } catch (err) {
    // Audit failures are surfaced to logs but never thrown. The Worker
    // strips PHI from console output by convention; see docs/PRIVACY.md.
    console.error("audit write failed", { eventType: event.eventType, err: String(err) });
  }
}
