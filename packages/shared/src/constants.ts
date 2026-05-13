// Constants shared between Worker API, patient PWA, and provider web.

export const GLUCOSE_SOURCES = ["cgm", "manual", "lancet"] as const;
export type GlucoseSource = (typeof GLUCOSE_SOURCES)[number];

// CGM vendors the native sensor bridge knows how to talk to.
// "unknown" covers manual entries and pre-pairing reads.
export const GLUCOSE_VENDORS = ["dexcom", "libre", "unknown"] as const;
export type GlucoseVendor = (typeof GLUCOSE_VENDORS)[number];

// How a reading reached Dragonfly. Bridge adapters set "native-ble" or
// "native-nfc"; HealthKit/Health Connect imports preserve their origin;
// patient PWA manual entry is "manual".
export const INGESTION_PATHS = [
  "native-ble",
  "native-nfc",
  "healthkit",
  "health-connect",
  "manual",
] as const;
export type IngestionPath = (typeof INGESTION_PATHS)[number];

// Why the reading exists. Live sensor stream vs. bulk backfill from a
// vendor cloud or after-the-fact NFC scan vs. user-entered fingerstick.
export const READING_KINDS = ["sensor", "backfill", "manual"] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

// Dexcom-style trend arrows. Libre maps to similar buckets; "flat" is the
// neutral default. Bridges should normalize to this set.
export const GLUCOSE_TRENDS = [
  "rising_quickly",
  "rising",
  "rising_slowly",
  "flat",
  "falling_slowly",
  "falling",
  "falling_quickly",
  "unknown",
] as const;
export type GlucoseTrend = (typeof GLUCOSE_TRENDS)[number];

export const GLUCOSE_CONTEXTS = [
  "pre_taiyi",
  "post_taiyi",
  "before_lunch",
  "post_lunch_1_to_2h",
  "post_lunch_3_to_4h",
  "end_of_day",
] as const;
export type GlucoseContext = (typeof GLUCOSE_CONTEXTS)[number];

export const GLUCOSE_CONTEXT_LABELS: Record<GlucoseContext, string> = {
  pre_taiyi: "Before Taiyi",
  post_taiyi: "After Taiyi",
  before_lunch: "Before lunch",
  post_lunch_1_to_2h: "Lunch +1–2h",
  post_lunch_3_to_4h: "Lunch +3–4h",
  end_of_day: "End of day",
};

export const TELEMED_STATUSES = [
  "requested",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type TelemedStatus = (typeof TELEMED_STATUSES)[number];

export const PROVIDER_TASK_STATES = ["open", "in_review", "resolved"] as const;
export type ProviderTaskState = (typeof PROVIDER_TASK_STATES)[number];

// Glucose status bands (mg/dL). Matches the design tokens (success/warning/error).
// These are research-MVP heuristics, not a clinical reference range.
export const GLUCOSE_TARGET_LOW_MG_DL = 70;
export const GLUCOSE_TARGET_HIGH_MG_DL = 180;
export const GLUCOSE_CRITICAL_LOW_MG_DL = 54;
export const GLUCOSE_CRITICAL_HIGH_MG_DL = 250;
