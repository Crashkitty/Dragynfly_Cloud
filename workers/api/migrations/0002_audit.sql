-- Audit log. Append-only. PHI is intentionally not stored — only IDs,
-- event types, outcomes, and short opaque metadata strings.
--
-- Retention is operator-controlled (see docs/AUDIT_LOG.md). The Worker
-- never deletes audit rows on its own.

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  occurred_at     TEXT NOT NULL,
  actor_kind      TEXT NOT NULL,           -- 'provider' | 'patient' | 'bridge' | 'coordinator' | 'system'
  actor_id        TEXT,                    -- patient id, bridge token hash prefix, or NULL
  event_type      TEXT NOT NULL,           -- e.g. 'patient.viewed', 'glucose.sync.accepted'
  target_kind     TEXT,                    -- 'patient' | 'glucose_batch' | 'upload' | 'telemed_session'
  target_id       TEXT,
  outcome         TEXT NOT NULL,           -- 'ok' | 'denied' | 'invalid' | 'error'
  detail          TEXT                     -- short opaque string; never raw PHI
);
CREATE INDEX IF NOT EXISTS idx_audit_occurred  ON audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target    ON audit_log(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_event     ON audit_log(event_type, occurred_at DESC);
