import type {
  GlucoseReading,
  MealEntry,
  NewGlucoseReading,
  NewMealEntry,
  NewTelemedicineSession,
  Patient,
  TelemedicineSession,
} from "@dragonfly/shared";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Two-step signed upload: ask the Worker for { putUrl, getUrl, key },
// PUT the bytes to putUrl, then store getUrl as the persistent reference.
async function uploadSignedMedia(args: {
  kind: "meal_photo" | "glucose_evidence" | "consent_doc";
  patientId: string;
  file: File;
}): Promise<{ getUrl: string; key: string }> {
  const sign = await http<{ key: string; putUrl: string; getUrl: string }>(
    `/api/uploads/sign`,
    {
      method: "POST",
      body: JSON.stringify({
        kind: args.kind,
        patientId: args.patientId,
        contentType: args.file.type,
        filename: args.file.name,
      }),
    },
  );
  const putRes = await fetch(`${BASE}${sign.putUrl}`, {
    method: "PUT",
    headers: { "Content-Type": args.file.type, "Content-Length": String(args.file.size) },
    body: args.file,
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    throw new Error(`Upload failed (${putRes.status}): ${t}`);
  }
  return { getUrl: `${BASE}${sign.getUrl}`, key: sign.key };
}

export const api = {
  patientByEnrollment: (enrollmentId: string) =>
    http<Patient>(`/api/patients/by-enrollment/${encodeURIComponent(enrollmentId)}`),
  glucoseList: (patientId: string) =>
    http<GlucoseReading[]>(`/api/glucose?patientId=${encodeURIComponent(patientId)}`),
  addGlucose: (input: NewGlucoseReading) =>
    http<GlucoseReading>(`/api/glucose`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  mealsList: (patientId: string) =>
    http<MealEntry[]>(`/api/meals?patientId=${encodeURIComponent(patientId)}`),
  addMeal: (input: NewMealEntry) =>
    http<MealEntry>(`/api/meals`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  uploadMealPhoto: (patientId: string, file: File) =>
    uploadSignedMedia({ kind: "meal_photo", patientId, file }),
  telemedList: (patientId: string) =>
    http<TelemedicineSession[]>(`/api/telemed?patientId=${encodeURIComponent(patientId)}`),
  requestTelemed: (input: NewTelemedicineSession) =>
    http<TelemedicineSession>(`/api/telemed`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export const TELEMED_BASE = (import.meta.env.VITE_TELEMED_BASE_URL as string | undefined) ??
  "http://localhost:8788";
