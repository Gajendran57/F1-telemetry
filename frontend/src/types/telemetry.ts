/**
 * These interfaces mirror the Pydantic models in backend/f1_verifier/schemas.py.
 * The FastAPI layer serialises with `.model_dump()` — the field names below
 * are the contract between backend and UI.
 */

export type Compound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';

/** One row of a FastF1 `lap.get_telemetry()` DataFrame. */
export interface TelemetrySample {
  distance: number;   // m, cumulative from lap start
  time: number;       // s, seconds since lap start
  speed: number;      // km/h
  throttle: number;   // 0-100 %
  brake: boolean;
  gear: number;       // 1-8, 0 = neutral
  rpm: number;
  drs: number;        // 0 = closed, >=10 = open
  x: number;          // GPS east, m
  y: number;          // GPS north, m
}

export interface LapTelemetry {
  driver: string;
  lapNumber: number;
  lapTime: number;    // s
  compound: Compound;
  samples: TelemetrySample[];
}

export interface DeltaTPoint {
  distance: number;   // m
  delta: number;      // s (reference - comparison); positive => reference slower
}

export interface CornerAnalysis {
  corner: number;
  startDistance: number;
  apexDistance: number;
  endDistance: number;
  minSpeed: number;
  entrySpeed: number;
  exitSpeed: number;
  gearAtApex: number;
  brakePoint: number | null;
  brakeRelease: number | null;
  brakeDuration: number | null;
  apexX: number;
  apexY: number;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ValidationIssue {
  id: string;
  check: string;
  status: CheckStatus;
  detail: string;
}

export interface VerifierReport {
  generatedAt: string;
  totalChecks: number;
  passed: number;
  warned: number;
  failed: number;
  issues: ValidationIssue[];
}

export interface CornerDelta {
  corner: number;
  refMinSpeed: number;
  cmpMinSpeed: number;
  minSpeedDelta: number;
  apexDistanceDelta: number;
}
