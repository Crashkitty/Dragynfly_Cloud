import type {
  GlucoseSource,
  GlucoseContext,
  GlucoseVendor,
  GlucoseTrend,
  IngestionPath,
  ReadingKind,
  TelemedStatus,
  ProviderTaskState,
} from "./constants.js";

export interface Patient {
  id: string;
  studyEnrollmentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // ISO date
  diabetesType?: "type1" | "type2" | "gestational" | "other";
  medications?: string[];
  consentSignedAt?: string; // ISO datetime
  enrolledAt: string; // ISO datetime
}

export interface NewPatient {
  studyEnrollmentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  diabetesType?: Patient["diabetesType"];
  medications?: string[];
}

export type GlucoseStatus = "ok" | "warn" | "critical";

export interface GlucoseReading {
  id: string;
  patientId: string;
  valueMgDl: number;
  source: GlucoseSource;
  vendor: GlucoseVendor;
  deviceName?: string;
  context: GlucoseContext;
  timestamp: string; // ISO datetime
  status: GlucoseStatus;
  notes?: string;
  photoUrl?: string;
  trend?: GlucoseTrend;
  rawDeviceId?: string;
  readingKind?: ReadingKind;
  ingestionPath?: IngestionPath;
}

export interface NewGlucoseReading {
  patientId: string;
  valueMgDl: number;
  source: GlucoseSource;
  vendor?: GlucoseVendor;
  deviceName?: string;
  context: GlucoseContext;
  timestamp?: string; // defaults to now
  notes?: string;
  photoUrl?: string;
  trend?: GlucoseTrend;
  rawDeviceId?: string;
  readingKind?: ReadingKind;
  ingestionPath?: IngestionPath;
}

// Batch payload uploaded by the native sensor bridge. The bridge may post
// the same batch more than once on flaky networks, so the API
// de-duplicates by `(rawDeviceId, timestamp)` when both are present.
export interface GlucoseSyncBatch {
  patientId: string;
  vendor: GlucoseVendor;
  deviceName?: string;
  bridgeVersion?: string;
  readings: NewGlucoseReading[];
}

export interface GlucoseSyncResult {
  accepted: number;
  duplicates: number;
  rejected: Array<{ index: number; reason: string }>;
}

export interface MealEntry {
  id: string;
  patientId: string;
  description: string;
  carbsGrams?: number;
  imageUrl?: string;
  capturedAt: string; // ISO datetime
}

export interface NewMealEntry {
  patientId: string;
  description: string;
  carbsGrams?: number;
  imageUrl?: string;
  capturedAt?: string;
}

export interface TelemedicineSession {
  id: string;
  patientId: string;
  status: TelemedStatus;
  channel: "video" | "chat" | "phone";
  topic: string;
  requestedAt: string;
  scheduledAt?: string;
  roomId?: string; // links into apps/telemed
  notes?: string;
}

export interface NewTelemedicineSession {
  patientId: string;
  topic: string;
  channel?: TelemedicineSession["channel"];
  scheduledAt?: string;
  notes?: string;
}

export interface ProviderQueueItem {
  patientId: string;
  patientName: string;
  studyEnrollmentId: string;
  lastReadingMgDl?: number;
  lastReadingStatus?: GlucoseStatus;
  lastReadingAt?: string;
  openTaskCount: number;
  flagged: boolean;
}

export interface ProviderTask {
  id: string;
  patientId: string;
  title: string;
  state: ProviderTaskState;
  createdAt: string;
  updatedAt: string;
}

export interface PatientOverview {
  patient: Patient;
  recentGlucose: GlucoseReading[];
  recentMeals: MealEntry[];
  upcomingTelemed: TelemedicineSession[];
  openTasks: ProviderTask[];
}

export interface ApiError {
  error: string;
  details?: unknown;
}
