import {
  classifyGlucose,
  type GlucoseReading,
  type MealEntry,
  type NewGlucoseReading,
  type NewMealEntry,
  type NewPatient,
  type NewTelemedicineSession,
  type Patient,
  type PatientOverview,
  type ProviderQueueItem,
  type ProviderTask,
  type TelemedicineSession,
} from "@dragonfly/shared";
import type {
  AuditEvent,
  AuditFilter,
  BridgeTokenSummary,
  NewAuditEvent,
  Repo,
} from "./types.js";

// In-memory dev/test adapter. Per-isolate; resets on Worker reload.
// Pre-seeded with a handful of pilot-study participants so the dashboards
// have something to render in dev without manual setup.

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

export class MemoryRepo implements Repo {
  private patients = new Map<string, Patient>();
  private glucose = new Map<string, GlucoseReading>();
  private meals = new Map<string, MealEntry>();
  private telemed = new Map<string, TelemedicineSession>();
  private tasks = new Map<string, ProviderTask>();
  private bridgeTokens = new Map<string, { patientId: string; label?: string; createdAt: string }>();
  private audit: AuditEvent[] = [];

  constructor() {
    this.seed();
  }

  private seed(): void {
    const p1: Patient = {
      id: id(),
      studyEnrollmentId: "TY-0001",
      firstName: "Mei",
      lastName: "Chen",
      dateOfBirth: "1955-03-14",
      diabetesType: "type2",
      medications: ["Metformin 500mg"],
      enrolledAt: isoDaysAgo(28),
      consentSignedAt: isoDaysAgo(28),
    };
    const p2: Patient = {
      id: id(),
      studyEnrollmentId: "TY-0002",
      firstName: "Robert",
      lastName: "Alvarez",
      dateOfBirth: "1948-09-02",
      diabetesType: "type2",
      medications: ["Glipizide", "Lisinopril"],
      enrolledAt: isoDaysAgo(21),
      consentSignedAt: isoDaysAgo(21),
    };
    const p3: Patient = {
      id: id(),
      studyEnrollmentId: "TY-0003",
      firstName: "Aiko",
      lastName: "Tanaka",
      dateOfBirth: "1962-11-30",
      diabetesType: "type2",
      medications: [],
      enrolledAt: isoDaysAgo(14),
      consentSignedAt: isoDaysAgo(14),
    };
    [p1, p2, p3].forEach((p) => this.patients.set(p.id, p));

    const seedGlucose: Array<[string, number, GlucoseReading["context"], number]> = [
      [p1.id, 142, "post_lunch_1_to_2h", 2],
      [p1.id, 118, "pre_taiyi", 8],
      [p1.id, 96, "post_taiyi", 6],
      [p2.id, 261, "post_lunch_1_to_2h", 1],
      [p2.id, 198, "before_lunch", 5],
      [p3.id, 110, "end_of_day", 3],
      [p3.id, 88, "pre_taiyi", 9],
    ];
    seedGlucose.forEach(([pid, value, ctx, hoursAgo]) => {
      const reading: GlucoseReading = {
        id: id(),
        patientId: pid,
        valueMgDl: value,
        source: "manual",
        vendor: "unknown",
        context: ctx,
        timestamp: isoHoursAgo(hoursAgo),
        status: classifyGlucose(value),
        readingKind: "manual",
        ingestionPath: "manual",
      };
      this.glucose.set(reading.id, reading);
    });

    const seedMeals: Array<[string, string, number]> = [
      [p1.id, "Brown rice congee with steamed bok choy", 6],
      [p2.id, "Two slices white toast with jam", 1],
      [p3.id, "Chicken stir-fry, no rice", 12],
    ];
    seedMeals.forEach(([pid, desc, hoursAgo]) => {
      const meal: MealEntry = {
        id: id(),
        patientId: pid,
        description: desc,
        capturedAt: isoHoursAgo(hoursAgo),
      };
      this.meals.set(meal.id, meal);
    });

    // One existing telemed request to populate the provider queue.
    const t: TelemedicineSession = {
      id: id(),
      patientId: p2.id,
      topic: "Post-lunch reading consistently > 250",
      channel: "video",
      status: "requested",
      requestedAt: isoHoursAgo(2),
    };
    this.telemed.set(t.id, t);

    const task: ProviderTask = {
      id: id(),
      patientId: p2.id,
      title: "Review elevated post-lunch trend",
      state: "open",
      createdAt: isoHoursAgo(2),
      updatedAt: isoHoursAgo(2),
    };
    this.tasks.set(task.id, task);
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
    this.patients.set(p.id, p);
    return p;
  }

  async listPatients(): Promise<Patient[]> {
    return Array.from(this.patients.values()).sort((a, b) =>
      a.lastName.localeCompare(b.lastName),
    );
  }

  async getPatient(pid: string): Promise<Patient | null> {
    return this.patients.get(pid) ?? null;
  }

  async getPatientByEnrollmentId(enrollmentId: string): Promise<Patient | null> {
    for (const p of this.patients.values()) {
      if (p.studyEnrollmentId === enrollmentId) return p;
    }
    return null;
  }

  async addGlucoseReading(input: NewGlucoseReading): Promise<GlucoseReading> {
    const reading: GlucoseReading = {
      id: id(),
      patientId: input.patientId,
      valueMgDl: input.valueMgDl,
      source: input.source,
      vendor: input.vendor ?? (input.source === "cgm" ? "unknown" : "unknown"),
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
    this.glucose.set(reading.id, reading);
    return reading;
  }

  // Returns null if a reading with the same (patientId, rawDeviceId, timestamp)
  // already exists. Used by the sync endpoint to dedupe replayed batches from
  // the native bridge without forcing the bridge to track server-side ids.
  async addGlucoseReadingIfNew(input: NewGlucoseReading): Promise<GlucoseReading | null> {
    if (input.rawDeviceId && input.timestamp) {
      for (const r of this.glucose.values()) {
        if (
          r.patientId === input.patientId &&
          r.rawDeviceId === input.rawDeviceId &&
          r.timestamp === input.timestamp
        ) {
          return null;
        }
      }
    }
    return this.addGlucoseReading(input);
  }

  async listGlucoseForPatient(patientId: string, limit = 100): Promise<GlucoseReading[]> {
    return Array.from(this.glucose.values())
      .filter((g) => g.patientId === patientId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
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
    this.meals.set(meal.id, meal);
    return meal;
  }

  async listMealsForPatient(patientId: string, limit = 50): Promise<MealEntry[]> {
    return Array.from(this.meals.values())
      .filter((m) => m.patientId === patientId)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
      .slice(0, limit);
  }

  async requestTelemedSession(input: NewTelemedicineSession): Promise<TelemedicineSession> {
    const session: TelemedicineSession = {
      id: id(),
      patientId: input.patientId,
      status: "requested",
      channel: input.channel ?? "video",
      topic: input.topic,
      requestedAt: nowIso(),
      scheduledAt: input.scheduledAt,
      notes: input.notes,
    };
    this.telemed.set(session.id, session);
    return session;
  }

  async listTelemedForPatient(patientId: string): Promise<TelemedicineSession[]> {
    return Array.from(this.telemed.values())
      .filter((s) => s.patientId === patientId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  async getTelemedSession(sessionId: string): Promise<TelemedicineSession | null> {
    return this.telemed.get(sessionId) ?? null;
  }

  async updateTelemedStatus(
    sessionId: string,
    status: TelemedicineSession["status"],
    roomId?: string,
  ): Promise<TelemedicineSession | null> {
    const s = this.telemed.get(sessionId);
    if (!s) return null;
    const updated: TelemedicineSession = { ...s, status, roomId: roomId ?? s.roomId };
    this.telemed.set(sessionId, updated);
    return updated;
  }

  async getProviderQueue(): Promise<ProviderQueueItem[]> {
    const items: ProviderQueueItem[] = [];
    for (const p of this.patients.values()) {
      const readings = await this.listGlucoseForPatient(p.id, 1);
      const last = readings[0];
      const tasks = await this.listOpenTasks(p.id);
      items.push({
        patientId: p.id,
        patientName: `${p.firstName} ${p.lastName}`,
        studyEnrollmentId: p.studyEnrollmentId,
        lastReadingMgDl: last?.valueMgDl,
        lastReadingStatus: last?.status,
        lastReadingAt: last?.timestamp,
        openTaskCount: tasks.length,
        flagged: last?.status !== "ok" || tasks.length > 0,
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
    return Array.from(this.tasks.values())
      .filter((t) => t.patientId === patientId && t.state !== "resolved")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createProviderTask(patientId: string, title: string): Promise<ProviderTask> {
    const task: ProviderTask = {
      id: id(),
      patientId,
      title,
      state: "open",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async updateProviderTaskState(
    taskId: string,
    state: ProviderTask["state"],
  ): Promise<ProviderTask | null> {
    const t = this.tasks.get(taskId);
    if (!t) return null;
    const updated: ProviderTask = { ...t, state, updatedAt: nowIso() };
    this.tasks.set(taskId, updated);
    return updated;
  }

  async storeBridgeTokenHash(tokenHash: string, patientId: string, label?: string): Promise<void> {
    this.bridgeTokens.set(tokenHash, { patientId, label, createdAt: nowIso() });
  }

  async patientForBridgeTokenHash(tokenHash: string): Promise<string | null> {
    return this.bridgeTokens.get(tokenHash)?.patientId ?? null;
  }

  async listBridgeTokensForPatient(patientId: string): Promise<BridgeTokenSummary[]> {
    const out: BridgeTokenSummary[] = [];
    for (const [hash, meta] of this.bridgeTokens.entries()) {
      if (meta.patientId !== patientId) continue;
      out.push({
        hashPrefix: hash.slice(0, 12),
        label: meta.label,
        createdAt: meta.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async revokeBridgeTokenByHashPrefix(
    prefix: string,
  ): Promise<{ revoked: number; patientId?: string }> {
    const safe = prefix.toLowerCase().replace(/[^0-9a-f]/g, "");
    if (safe.length < 8) return { revoked: 0 };
    const matches: string[] = [];
    for (const hash of this.bridgeTokens.keys()) {
      if (hash.startsWith(safe)) matches.push(hash);
    }
    if (matches.length !== 1) return { revoked: 0 };
    const hash = matches[0];
    const meta = this.bridgeTokens.get(hash);
    this.bridgeTokens.delete(hash);
    return { revoked: 1, patientId: meta?.patientId };
  }

  async addAuditEvent(event: NewAuditEvent): Promise<void> {
    this.audit.push({ ...event, id: id(), occurredAt: nowIso() });
  }

  async listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]> {
    let rows = this.audit;
    if (filter?.eventType) rows = rows.filter((e) => e.eventType === filter.eventType);
    if (filter?.actorKind) rows = rows.filter((e) => e.actorKind === filter.actorKind);
    if (filter?.targetKind) rows = rows.filter((e) => e.targetKind === filter.targetKind);
    if (filter?.targetId) rows = rows.filter((e) => e.targetId === filter.targetId);
    rows = [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return rows.slice(0, Math.min(Math.max(filter?.limit ?? 200, 1), 500));
  }
}
