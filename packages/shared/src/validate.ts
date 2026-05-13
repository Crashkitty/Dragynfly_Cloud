// Tiny dependency-free validator. Avoids pulling zod into a Worker bundle
// for the MVP, but keeps a similar shape so swapping later is mechanical.

import {
  GLUCOSE_CONTEXTS,
  GLUCOSE_SOURCES,
  GLUCOSE_TRENDS,
  GLUCOSE_VENDORS,
  INGESTION_PATHS,
  READING_KINDS,
  TELEMED_STATUSES,
  type GlucoseContext,
  type GlucoseSource,
  type GlucoseTrend,
  type GlucoseVendor,
  type IngestionPath,
  type ReadingKind,
} from "./constants.js";
import type {
  GlucoseSyncBatch,
  NewGlucoseReading,
  NewMealEntry,
  NewPatient,
  NewTelemedicineSession,
} from "./types.js";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

function isOptionalNumber(v: unknown): v is number | undefined {
  return v === undefined || (typeof v === "number" && Number.isFinite(v));
}

function isIsoDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

export function validateNewPatient(input: unknown): ValidationResult<NewPatient> {
  const errs: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(o.studyEnrollmentId)) errs.push("studyEnrollmentId is required");
  if (!isNonEmptyString(o.firstName)) errs.push("firstName is required");
  if (!isNonEmptyString(o.lastName)) errs.push("lastName is required");
  if (o.dateOfBirth !== undefined && !isIsoDate(o.dateOfBirth)) errs.push("dateOfBirth must be ISO date");
  if (o.diabetesType !== undefined &&
    !["type1", "type2", "gestational", "other"].includes(String(o.diabetesType))) {
    errs.push("diabetesType invalid");
  }
  if (o.medications !== undefined && !(Array.isArray(o.medications) && o.medications.every((m) => typeof m === "string"))) {
    errs.push("medications must be string[]");
  }
  if (errs.length) return { ok: false, errors: errs };
  return {
    ok: true,
    value: {
      studyEnrollmentId: (o.studyEnrollmentId as string).trim(),
      firstName: (o.firstName as string).trim(),
      lastName: (o.lastName as string).trim(),
      dateOfBirth: o.dateOfBirth as string | undefined,
      diabetesType: o.diabetesType as NewPatient["diabetesType"],
      medications: o.medications as string[] | undefined,
    },
  };
}

export function validateNewGlucoseReading(input: unknown): ValidationResult<NewGlucoseReading> {
  const errs: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(o.patientId)) errs.push("patientId is required");
  if (typeof o.valueMgDl !== "number" || !Number.isFinite(o.valueMgDl)) {
    errs.push("valueMgDl must be a number");
  } else if (o.valueMgDl < 10 || o.valueMgDl > 1000) {
    errs.push("valueMgDl out of plausible range");
  }
  if (!GLUCOSE_SOURCES.includes(o.source as GlucoseSource)) {
    errs.push(`source must be one of ${GLUCOSE_SOURCES.join("|")}`);
  }
  if (!GLUCOSE_CONTEXTS.includes(o.context as GlucoseContext)) {
    errs.push(`context must be one of ${GLUCOSE_CONTEXTS.join("|")}`);
  }
  if (o.vendor !== undefined && !GLUCOSE_VENDORS.includes(o.vendor as GlucoseVendor)) {
    errs.push(`vendor must be one of ${GLUCOSE_VENDORS.join("|")}`);
  }
  if (o.trend !== undefined && !GLUCOSE_TRENDS.includes(o.trend as GlucoseTrend)) {
    errs.push(`trend must be one of ${GLUCOSE_TRENDS.join("|")}`);
  }
  if (o.readingKind !== undefined && !READING_KINDS.includes(o.readingKind as ReadingKind)) {
    errs.push(`readingKind must be one of ${READING_KINDS.join("|")}`);
  }
  if (o.ingestionPath !== undefined && !INGESTION_PATHS.includes(o.ingestionPath as IngestionPath)) {
    errs.push(`ingestionPath must be one of ${INGESTION_PATHS.join("|")}`);
  }
  if (!isOptionalString(o.deviceName)) errs.push("deviceName must be string");
  if (!isOptionalString(o.notes)) errs.push("notes must be string");
  if (!isOptionalString(o.photoUrl)) errs.push("photoUrl must be string");
  if (!isOptionalString(o.rawDeviceId)) errs.push("rawDeviceId must be string");
  if (o.timestamp !== undefined && !isIsoDate(o.timestamp)) errs.push("timestamp must be ISO datetime");
  if (errs.length) return { ok: false, errors: errs };
  return {
    ok: true,
    value: {
      patientId: (o.patientId as string).trim(),
      valueMgDl: o.valueMgDl as number,
      source: o.source as GlucoseSource,
      vendor: o.vendor as GlucoseVendor | undefined,
      context: o.context as GlucoseContext,
      deviceName: o.deviceName as string | undefined,
      notes: o.notes as string | undefined,
      photoUrl: o.photoUrl as string | undefined,
      timestamp: o.timestamp as string | undefined,
      trend: o.trend as GlucoseTrend | undefined,
      rawDeviceId: o.rawDeviceId as string | undefined,
      readingKind: o.readingKind as ReadingKind | undefined,
      ingestionPath: o.ingestionPath as IngestionPath | undefined,
    },
  };
}

export function validateGlucoseSyncBatch(input: unknown): ValidationResult<GlucoseSyncBatch> {
  const errs: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(o.patientId)) errs.push("patientId is required");
  if (!GLUCOSE_VENDORS.includes(o.vendor as GlucoseVendor)) {
    errs.push(`vendor must be one of ${GLUCOSE_VENDORS.join("|")}`);
  }
  if (!isOptionalString(o.deviceName)) errs.push("deviceName must be string");
  if (!isOptionalString(o.bridgeVersion)) errs.push("bridgeVersion must be string");
  if (!Array.isArray(o.readings)) errs.push("readings must be an array");
  if (errs.length) return { ok: false, errors: errs };
  // Per-reading validation is performed by the route handler so it can
  // report which indices were rejected without short-circuiting the batch.
  return {
    ok: true,
    value: {
      patientId: (o.patientId as string).trim(),
      vendor: o.vendor as GlucoseVendor,
      deviceName: o.deviceName as string | undefined,
      bridgeVersion: o.bridgeVersion as string | undefined,
      readings: o.readings as NewGlucoseReading[],
    },
  };
}

export function validateNewMealEntry(input: unknown): ValidationResult<NewMealEntry> {
  const errs: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(o.patientId)) errs.push("patientId is required");
  if (!isNonEmptyString(o.description)) errs.push("description is required");
  if (!isOptionalNumber(o.carbsGrams)) errs.push("carbsGrams must be number");
  if (!isOptionalString(o.imageUrl)) errs.push("imageUrl must be string");
  if (o.capturedAt !== undefined && !isIsoDate(o.capturedAt)) errs.push("capturedAt must be ISO datetime");
  if (errs.length) return { ok: false, errors: errs };
  return {
    ok: true,
    value: {
      patientId: (o.patientId as string).trim(),
      description: (o.description as string).trim(),
      carbsGrams: o.carbsGrams as number | undefined,
      imageUrl: o.imageUrl as string | undefined,
      capturedAt: o.capturedAt as string | undefined,
    },
  };
}

export function validateNewTelemedSession(input: unknown): ValidationResult<NewTelemedicineSession> {
  const errs: string[] = [];
  const o = (input ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(o.patientId)) errs.push("patientId is required");
  if (!isNonEmptyString(o.topic)) errs.push("topic is required");
  if (o.channel !== undefined && !["video", "chat", "phone"].includes(String(o.channel))) {
    errs.push("channel must be video|chat|phone");
  }
  if (o.scheduledAt !== undefined && !isIsoDate(o.scheduledAt)) errs.push("scheduledAt must be ISO datetime");
  if (!isOptionalString(o.notes)) errs.push("notes must be string");
  if (errs.length) return { ok: false, errors: errs };
  return {
    ok: true,
    value: {
      patientId: (o.patientId as string).trim(),
      topic: (o.topic as string).trim(),
      channel: (o.channel as "video" | "chat" | "phone" | undefined) ?? "video",
      scheduledAt: o.scheduledAt as string | undefined,
      notes: o.notes as string | undefined,
    },
  };
}

// Re-exports of constants validators consume, so callers don't import twice.
export {
  GLUCOSE_CONTEXTS,
  GLUCOSE_SOURCES,
  GLUCOSE_VENDORS,
  GLUCOSE_TRENDS,
  INGESTION_PATHS,
  READING_KINDS,
  TELEMED_STATUSES,
};
