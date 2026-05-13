import {
  classifyGlucose,
  type GlucoseContext,
  type GlucoseReading,
  type GlucoseSource,
  type GlucoseStatus,
  type GlucoseTrend,
  type GlucoseVendor,
  type IngestionPath,
  type MealEntry,
  type NewGlucoseReading,
  type NewMealEntry,
  type NewPatient,
  type NewTelemedicineSession,
  type Patient,
  type PatientOverview,
  type ProviderQueueItem,
  type ProviderTask,
  type ProviderTaskState,
  type ReadingKind,
  type TelemedicineSession,
  type TelemedStatus,
} from "@dragonfly/shared";
import type {
  AuditEvent,
  AuditFilter,
  BridgeTokenSummary,
  NewAuditEvent,
  Repo,
} from "./types.js";

// Cloudflare D1 adapter. SQLite-on-edge, self-contained, owned by Dragonfly.
// Schema lives in workers/api/migrations/0001_init.sql.

function id(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function isoHoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

interface PatientRow {
  id: string;
  study_enrollment_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  diabetes_type: string | null;
  medications: string;
  consent_signed_at: string | null;
  enrolled_at: string;
}

interface GlucoseRow {
  id: string;
  patient_id: string;
  value_mg_dl: number;
  source: string;
  vendor: string;
  device_name: string | null;
  context: string;
  timestamp: string;
  status: string;
  notes: string | null;
  photo_url: string | null;
  trend: string | null;
  raw_device_id: string | null;
  reading_kind: string | null;
  ingestion_path: string | null;
}

interface MealRow {
  id: string;
  patient_id: string;
  description: string;
  carbs_grams: number | null;
  image_url: string | null;
  captured_at: string;
}

interface TelemedRow {
  id: string;
  patient_id: string;
  status: string;
  channel: string;
  topic: string;
  requested_at: string;
  scheduled_at: string | null;
  room_id: string | null;
  notes: string | null;
}

interface TaskRow {
  id: string;
  patient_id: string;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
}

function toPatient(r: PatientRow): Patient {
  return {
    id: r.id,
    studyEnrollmentId: r.study_enrollment_id,
    firstName: r.first_name,
    lastName: r.last_name,
    dateOfBirth: r.date_of_birth ?? undefined,
    diabetesType: (r.diabetes_type ?? undefined) as Patient["diabetesType"],
    medications: r.medications ? (JSON.parse(r.medications) as string[]) : [],
    consentSignedAt: r.consent_signed_at ?? undefined,
    enrolledAt: r.enrolled_at,
  };
}

function toGlucose(r: GlucoseRow): GlucoseReading {
  return {
    id: r.id,
    patientId: r.patient_id,
    valueMgDl: r.value_mg_dl,
    source: r.source as GlucoseSource,
    vendor: r.vendor as GlucoseVendor,
    deviceName: r.device_name ?? undefined,
    context: r.context as GlucoseContext,
    timestamp: r.timestamp,
    status: r.status as GlucoseStatus,
    notes: r.notes ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    trend: (r.trend ?? undefined) as GlucoseTrend | undefined,
    rawDeviceId: r.raw_device_id ?? undefined,
    readingKind: (r.reading_kind ?? undefined) as ReadingKind | undefined,
    ingestionPath: (r.ingestion_path ?? undefined) as IngestionPath | undefined,
  };
}

function toMeal(r: MealRow): MealEntry {
  return {
    id: r.id,
    patientId: r.patient_id,
    description: r.description,
    carbsGrams: r.carbs_grams ?? undefined,
    imageUrl: r.image_url ?? undefined,
    capturedAt: r.captured_at,
  };
}

function toTelemed(r: TelemedRow): TelemedicineSession {
  return {
    id: r.id,
    patientId: r.patient_id,
    status: r.status as TelemedStatus,
    channel: r.channel as TelemedicineSession["channel"],
    topic: r.topic,
    requestedAt: r.requested_at,
    scheduledAt: r.scheduled_at ?? undefined,
    roomId: r.room_id ?? undefined,
    notes: r.notes ?? undefined,
  };
}

function toTask(r: TaskRow): ProviderTask {
  return {
    id: r.id,
    patientId: r.patient_id,
    title: r.title,
    state: r.state as ProviderTaskState,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class D1Repo implements Repo {
  private seeded = false;

  constructor(private db: D1Database) {}

  // Seeds three pilot participants and a few readings on first use, only
  // when the patients table is empty. Lets dev/preview deployments come up
  // with usable demo data without hiding empty-state behavior in prod.
  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    const row = await this.db.prepare("SELECT COUNT(*) AS n FROM patients").first<{ n: number }>();
    if (row && row.n > 0) {
      this.seeded = true;
      return;
    }
    const p1 = id();
    const p2 = id();
    const p3 = id();
    const insertPatient = this.db.prepare(
      `INSERT INTO patients (id, study_enrollment_id, first_name, last_name, date_of_birth,
       diabetes_type, medications, consent_signed_at, enrolled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await this.db.batch([
      insertPatient.bind(p1, "TY-0001", "Mei", "Chen", "1955-03-14", "type2",
        JSON.stringify(["Metformin 500mg"]), isoDaysAgo(28), isoDaysAgo(28)),
      insertPatient.bind(p2, "TY-0002", "Robert", "Alvarez", "1948-09-02", "type2",
        JSON.stringify(["Glipizide", "Lisinopril"]), isoDaysAgo(21), isoDaysAgo(21)),
      insertPatient.bind(p3, "TY-0003", "Aiko", "Tanaka", "1962-11-30", "type2",
        JSON.stringify([]), isoDaysAgo(14), isoDaysAgo(14)),
    ]);

    const seedGlucose: Array<[string, number, GlucoseContext, number]> = [
      [p1, 142, "post_lunch_1_to_2h", 2],
      [p1, 118, "pre_taiyi", 8],
      [p1, 96, "post_taiyi", 6],
      [p2, 261, "post_lunch_1_to_2h", 1],
      [p2, 198, "before_lunch", 5],
      [p3, 110, "end_of_day", 3],
      [p3, 88, "pre_taiyi", 9],
    ];
    const insertGlucose = this.db.prepare(
      `INSERT INTO glucose_readings (id, patient_id, value_mg_dl, source, vendor,
       device_name, context, timestamp, status, notes, photo_url, trend,
       raw_device_id, reading_kind, ingestion_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    await this.db.batch(
      seedGlucose.map(([pid, val, ctx, hrs]) =>
        insertGlucose.bind(
          id(), pid, val, "manual", "unknown", null, ctx, isoHoursAgo(hrs),
          classifyGlucose(val), null, null, null, null, "manual", "manual",
        ),
      ),
    );

    const insertMeal = this.db.prepare(
      `INSERT INTO meals (id, patient_id, description, carbs_grams, image_url, captured_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    await this.db.batch([
      insertMeal.bind(id(), p1, "Brown rice congee with steamed bok choy", null, null, isoHoursAgo(6)),
      insertMeal.bind(id(), p2, "Two slices white toast with jam", null, null, isoHoursAgo(1)),
      insertMeal.bind(id(), p3, "Chicken stir-fry, no rice", null, null, isoHoursAgo(12)),
    ]);

    await this.db.prepare(
      `INSERT INTO telemed_sessions (id, patient_id, status, channel, topic, requested_at, scheduled_at, room_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id(), p2, "requested", "video",
      "Post-lunch reading consistently > 250", isoHoursAgo(2), null, null, null,
    ).run();

    await this.db.prepare(
      `INSERT INTO provider_tasks (id, patient_id, title, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      id(), p2, "Review elevated post-lunch trend", "open", isoHoursAgo(2), isoHoursAgo(2),
    ).run();

    this.seeded = true;
  }

  async createPatient(input: NewPatient): Promise<Patient> {
    const p: Patient = {
      id: id(),
      studyEnrollmentId: input.studyEnrollmentId,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      diabetesType: input.diabetesType,
      medications: input.medications ?? [],
      enrolledAt: nowIso(),
    };
    await this.db.prepare(
      `INSERT INTO patients (id, study_enrollment_id, first_name, last_name, date_of_birth,
       diabetes_type, medications, consent_signed_at, enrolled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      p.id, p.studyEnrollmentId, p.firstName, p.lastName,
      p.dateOfBirth ?? null, p.diabetesType ?? null,
      JSON.stringify(p.medications ?? []), null, p.enrolledAt,
    ).run();
    return p;
  }

  async listPatients(): Promise<Patient[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM patients ORDER BY last_name ASC")
      .all<PatientRow>();
    return results.map(toPatient);
  }

  async getPatient(pid: string): Promise<Patient | null> {
    const row = await this.db
      .prepare("SELECT * FROM patients WHERE id = ?")
      .bind(pid)
      .first<PatientRow>();
    return row ? toPatient(row) : null;
  }

  async getPatientByEnrollmentId(eid: string): Promise<Patient | null> {
    const row = await this.db
      .prepare("SELECT * FROM patients WHERE study_enrollment_id = ?")
      .bind(eid)
      .first<PatientRow>();
    return row ? toPatient(row) : null;
  }

  async addGlucoseReading(input: NewGlucoseReading): Promise<GlucoseReading> {
    const reading: GlucoseReading = {
      id: id(),
      patientId: input.patientId,
      valueMgDl: input.valueMgDl,
      source: input.source,
      vendor: input.vendor ?? "unknown",
      deviceName: input.deviceName,
      context: input.context,
      timestamp: input.timestamp ?? nowIso(),
      status: classifyGlucose(input.valueMgDl),
      notes: input.notes,
      photoUrl: input.photoUrl,
      trend: input.trend,
      rawDeviceId: input.rawDeviceId,
      readingKind: input.readingKind ?? (input.source === "cgm" ? "sensor" : "manual"),
      ingestionPath: input.ingestionPath ?? "manual",
    };
    await this.db.prepare(
      `INSERT INTO glucose_readings (id, patient_id, value_mg_dl, source, vendor,
       device_name, context, timestamp, status, notes, photo_url, trend,
       raw_device_id, reading_kind, ingestion_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      reading.id, reading.patientId, reading.valueMgDl, reading.source, reading.vendor,
      reading.deviceName ?? null, reading.context, reading.timestamp, reading.status,
      reading.notes ?? null, reading.photoUrl ?? null, reading.trend ?? null,
      reading.rawDeviceId ?? null, reading.readingKind ?? null, reading.ingestionPath ?? null,
    ).run();
    return reading;
  }

  async addGlucoseReadingIfNew(input: NewGlucoseReading): Promise<GlucoseReading | null> {
    if (input.rawDeviceId && input.timestamp) {
      const dup = await this.db.prepare(
        `SELECT id FROM glucose_readings
         WHERE patient_id = ? AND raw_device_id = ? AND timestamp = ?`,
      ).bind(input.patientId, input.rawDeviceId, input.timestamp).first();
      if (dup) return null;
    }
    return this.addGlucoseReading(input);
  }

  async listGlucoseForPatient(patientId: string, limit = 100): Promise<GlucoseReading[]> {
    const { results } = await this.db.prepare(
      "SELECT * FROM glucose_readings WHERE patient_id = ? ORDER BY timestamp DESC LIMIT ?",
    ).bind(patientId, limit).all<GlucoseRow>();
    return results.map(toGlucose);
  }

  async addMealEntry(input: NewMealEntry): Promise<MealEntry> {
    const meal: MealEntry = {
      id: id(),
      patientId: input.patientId,
      description: input.description,
      carbsGrams: input.carbsGrams,
      imageUrl: input.imageUrl,
      capturedAt: input.capturedAt ?? nowIso(),
    };
    await this.db.prepare(
      `INSERT INTO meals (id, patient_id, description, carbs_grams, image_url, captured_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      meal.id, meal.patientId, meal.description,
      meal.carbsGrams ?? null, meal.imageUrl ?? null, meal.capturedAt,
    ).run();
    return meal;
  }

  async listMealsForPatient(patientId: string, limit = 50): Promise<MealEntry[]> {
    const { results } = await this.db.prepare(
      "SELECT * FROM meals WHERE patient_id = ? ORDER BY captured_at DESC LIMIT ?",
    ).bind(patientId, limit).all<MealRow>();
    return results.map(toMeal);
  }

  async requestTelemedSession(input: NewTelemedicineSession): Promise<TelemedicineSession> {
    const s: TelemedicineSession = {
      id: id(),
      patientId: input.patientId,
      status: "requested",
      channel: input.channel ?? "video",
      topic: input.topic,
      requestedAt: nowIso(),
      scheduledAt: input.scheduledAt,
      notes: input.notes,
    };
    await this.db.prepare(
      `INSERT INTO telemed_sessions (id, patient_id, status, channel, topic, requested_at, scheduled_at, room_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      s.id, s.patientId, s.status, s.channel, s.topic,
      s.requestedAt, s.scheduledAt ?? null, null, s.notes ?? null,
    ).run();
    return s;
  }

  async listTelemedForPatient(patientId: string): Promise<TelemedicineSession[]> {
    const { results } = await this.db.prepare(
      "SELECT * FROM telemed_sessions WHERE patient_id = ? ORDER BY requested_at DESC",
    ).bind(patientId).all<TelemedRow>();
    return results.map(toTelemed);
  }

  async getTelemedSession(sessionId: string): Promise<TelemedicineSession | null> {
    const row = await this.db
      .prepare("SELECT * FROM telemed_sessions WHERE id = ?")
      .bind(sessionId)
      .first<TelemedRow>();
    return row ? toTelemed(row) : null;
  }

  async updateTelemedStatus(
    sessionId: string,
    status: TelemedStatus,
    roomId?: string,
  ): Promise<TelemedicineSession | null> {
    if (roomId !== undefined) {
      await this.db.prepare(
        `UPDATE telemed_sessions SET status = ?, room_id = ? WHERE id = ?`,
      ).bind(status, roomId, sessionId).run();
    } else {
      await this.db.prepare(
        `UPDATE telemed_sessions SET status = ? WHERE id = ?`,
      ).bind(status, sessionId).run();
    }
    const row = await this.db
      .prepare("SELECT * FROM telemed_sessions WHERE id = ?")
      .bind(sessionId)
      .first<TelemedRow>();
    return row ? toTelemed(row) : null;
  }

  async getProviderQueue(): Promise<ProviderQueueItem[]> {
    const patients = await this.listPatients();
    const items: ProviderQueueItem[] = [];
    for (const p of patients) {
      const last = await this.db.prepare(
        "SELECT * FROM glucose_readings WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1",
      ).bind(p.id).first<GlucoseRow>();
      const tasks = await this.listOpenTasks(p.id);
      const lastReading = last ? toGlucose(last) : undefined;
      items.push({
        patientId: p.id,
        patientName: `${p.firstName} ${p.lastName}`,
        studyEnrollmentId: p.studyEnrollmentId,
        lastReadingMgDl: lastReading?.valueMgDl,
        lastReadingStatus: lastReading?.status,
        lastReadingAt: lastReading?.timestamp,
        openTaskCount: tasks.length,
        flagged: Boolean((lastReading && lastReading.status !== "ok") || tasks.length > 0),
      });
    }
    return items.sort((a, b) => Number(b.flagged) - Number(a.flagged));
  }

  async getPatientOverview(patientId: string): Promise<PatientOverview | null> {
    const patient = await this.getPatient(patientId);
    if (!patient) return null;
    const [recentGlucose, recentMeals, telemed, openTasks] = await Promise.all([
      this.listGlucoseForPatient(patientId, 30),
      this.listMealsForPatient(patientId, 10),
      this.listTelemedForPatient(patientId),
      this.listOpenTasks(patientId),
    ]);
    const upcomingTelemed = telemed.filter(
      (s) => s.status === "requested" || s.status === "scheduled" || s.status === "in_progress",
    );
    return { patient, recentGlucose, recentMeals, upcomingTelemed, openTasks };
  }

  async listOpenTasks(patientId: string): Promise<ProviderTask[]> {
    const { results } = await this.db.prepare(
      "SELECT * FROM provider_tasks WHERE patient_id = ? AND state != 'resolved' ORDER BY created_at DESC",
    ).bind(patientId).all<TaskRow>();
    return results.map(toTask);
  }

  async createProviderTask(patientId: string, title: string): Promise<ProviderTask> {
    const t: ProviderTask = {
      id: id(),
      patientId,
      title,
      state: "open",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.db.prepare(
      `INSERT INTO provider_tasks (id, patient_id, title, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(t.id, t.patientId, t.title, t.state, t.createdAt, t.updatedAt).run();
    return t;
  }

  async updateProviderTaskState(taskId: string, state: ProviderTaskState): Promise<ProviderTask | null> {
    const updatedAt = nowIso();
    await this.db.prepare(
      `UPDATE provider_tasks SET state = ?, updated_at = ? WHERE id = ?`,
    ).bind(state, updatedAt, taskId).run();
    const row = await this.db
      .prepare("SELECT * FROM provider_tasks WHERE id = ?")
      .bind(taskId)
      .first<TaskRow>();
    return row ? toTask(row) : null;
  }

  async storeBridgeTokenHash(tokenHash: string, patientId: string, label?: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO bridge_tokens (token_hash, patient_id, label, created_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(tokenHash, patientId, label ?? null, nowIso()).run();
  }

  async patientForBridgeTokenHash(tokenHash: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT patient_id FROM bridge_tokens WHERE token_hash = ?")
      .bind(tokenHash)
      .first<{ patient_id: string }>();
    return row?.patient_id ?? null;
  }

  async listBridgeTokensForPatient(patientId: string): Promise<BridgeTokenSummary[]> {
    const { results } = await this.db.prepare(
      "SELECT token_hash, label, created_at FROM bridge_tokens WHERE patient_id = ? ORDER BY created_at DESC",
    ).bind(patientId).all<{ token_hash: string; label: string | null; created_at: string }>();
    return results.map((r) => ({
      hashPrefix: r.token_hash.slice(0, 12),
      label: r.label ?? undefined,
      createdAt: r.created_at,
    }));
  }

  async revokeBridgeTokenByHashPrefix(
    prefix: string,
  ): Promise<{ revoked: number; patientId?: string }> {
    const safe = prefix.toLowerCase().replace(/[^0-9a-f]/g, "");
    if (safe.length < 8) return { revoked: 0 };
    const matches = await this.db.prepare(
      "SELECT token_hash, patient_id FROM bridge_tokens WHERE token_hash LIKE ?",
    ).bind(`${safe}%`).all<{ token_hash: string; patient_id: string }>();
    const rows = matches.results;
    if (rows.length !== 1) return { revoked: 0 };
    await this.db.prepare("DELETE FROM bridge_tokens WHERE token_hash = ?")
      .bind(rows[0].token_hash).run();
    return { revoked: 1, patientId: rows[0].patient_id };
  }

  async addAuditEvent(event: NewAuditEvent): Promise<void> {
    await this.db.prepare(
      `INSERT INTO audit_log (id, occurred_at, actor_kind, actor_id, event_type,
       target_kind, target_id, outcome, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id(), nowIso(), event.actorKind, event.actorId ?? null, event.eventType,
      event.targetKind ?? null, event.targetId ?? null, event.outcome,
      event.detail ?? null,
    ).run();
  }

  async listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]> {
    const where: string[] = [];
    const binds: Array<string | number> = [];
    if (filter?.eventType)  { where.push("event_type = ?");  binds.push(filter.eventType); }
    if (filter?.actorKind)  { where.push("actor_kind = ?");  binds.push(filter.actorKind); }
    if (filter?.targetKind) { where.push("target_kind = ?"); binds.push(filter.targetKind); }
    if (filter?.targetId)   { where.push("target_id = ?");   binds.push(filter.targetId); }
    const sql =
      "SELECT * FROM audit_log " +
      (where.length ? `WHERE ${where.join(" AND ")} ` : "") +
      "ORDER BY occurred_at DESC LIMIT ?";
    binds.push(Math.min(Math.max(filter?.limit ?? 200, 1), 500));
    const { results } = await this.db.prepare(sql).bind(...binds).all<{
      id: string; occurred_at: string; actor_kind: string; actor_id: string | null;
      event_type: string; target_kind: string | null; target_id: string | null;
      outcome: string; detail: string | null;
    }>();
    return results.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      actorKind: r.actor_kind as AuditEvent["actorKind"],
      actorId: r.actor_id ?? undefined,
      eventType: r.event_type,
      targetKind: (r.target_kind ?? undefined) as AuditEvent["targetKind"],
      targetId: r.target_id ?? undefined,
      outcome: r.outcome as AuditEvent["outcome"],
      detail: r.detail ?? undefined,
    }));
  }
}
