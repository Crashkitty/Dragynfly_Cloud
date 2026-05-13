import {
  GLUCOSE_TARGET_LOW_MG_DL,
  GLUCOSE_TARGET_HIGH_MG_DL,
  GLUCOSE_CRITICAL_LOW_MG_DL,
  GLUCOSE_CRITICAL_HIGH_MG_DL,
} from "./constants.js";
import type { GlucoseStatus } from "./types.js";

export function classifyGlucose(valueMgDl: number): GlucoseStatus {
  if (
    valueMgDl <= GLUCOSE_CRITICAL_LOW_MG_DL ||
    valueMgDl >= GLUCOSE_CRITICAL_HIGH_MG_DL
  ) {
    return "critical";
  }
  if (
    valueMgDl < GLUCOSE_TARGET_LOW_MG_DL ||
    valueMgDl > GLUCOSE_TARGET_HIGH_MG_DL
  ) {
    return "warn";
  }
  return "ok";
}

export function glucoseStatusLabel(status: GlucoseStatus): string {
  switch (status) {
    case "ok":
      return "In range";
    case "warn":
      return "Out of range";
    case "critical":
      return "Critical";
  }
}
