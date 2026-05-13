-- Dragonfly Cloud D1 schema. Run with:
--   wrangler d1 execute dragonfly --local --file=migrations/0001_init.sql
-- For remote (after `wrangler d1 create dragonfly`):
--   wrangler d1 execute dragonfly --remote --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS patients (
  id                  TEXT PRIMARY KEY,
  study_enrollment_id TEXT NOT NULL UNIQUE,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  date_of_birth       TEXT,
  diabetes_type       TEXT,
  medications         TEXT NOT NULL DEFAULT '[]',
  consent_signed_at   TEXT,
  enrolled_at         TEXT NOT NULL
);

-- Bridge tokens are stored as SHA-256 hex of the raw bearer.
-- The raw token is shown to the coordinator once at issuance and never persisted.
CREATE TABLE IF NOT EXISTS bridge_tokens (
  token_hash  TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL,
  label       TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE INDEX IF NOT EXISTS idx_bridge_tokens_patient ON bridge_tokens(patient_id);

CREATE TABLE IF NOT EXISTS glucose_readings (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL,
  value_mg_dl     REAL NOT NULL,
  source          TEXT NOT NULL,
  vendor          TEXT NOT NULL,
  device_name     TEXT,
  context         TEXT NOT NULL,
  timestamp       TEXT NOT NULL,
  status          TEXT NOT NULL,
  notes           TEXT,
  photo_url       TEXT,
  trend           TEXT,
  raw_device_id   TEXT,
  reading_kind    TEXT,
  ingestion_path  TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE INDEX IF NOT EXISTS idx_glucose_patient_time
  ON glucose_readings(patient_id, timestamp DESC);
-- Idempotency for native bridge sync: same (patient, raw device sample, ts) only inserted once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_glucose_dedup
  ON glucose_readings(patient_id, raw_device_id, timestamp)
  WHERE raw_device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS meals (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL,
  description  TEXT NOT NULL,
  carbs_grams  REAL,
  image_url    TEXT,
  captured_at  TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE INDEX IF NOT EXISTS idx_meals_patient_time
  ON meals(patient_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS telemed_sessions (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL,
  status        TEXT NOT NULL,
  channel       TEXT NOT NULL,
  topic         TEXT NOT NULL,
  requested_at  TEXT NOT NULL,
  scheduled_at  TEXT,
  room_id       TEXT,
  notes         TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE INDEX IF NOT EXISTS idx_telemed_patient
  ON telemed_sessions(patient_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS provider_tasks (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  state       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_patient
  ON provider_tasks(patient_id, state);
