import type { LapTelemetry } from '../types/telemetry';
import { buildTrack } from '../lib/track';
import { generateLap, type LapGenOptions } from '../lib/telemetry';

const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export interface SessionData {
  laps: LapTelemetry[];
  source: 'backend' | 'synthetic';
}

/**
 * Tries the FastAPI backend first (if VITE_API_BASE_URL is set), and falls
 * back to the deterministic synthetic dataset if the backend is unreachable
 * or times out. This keeps the UI usable during development.
 */
export async function fetchSessionLaps(): Promise<SessionData> {
  if (BASE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/laps`, { signal: controller.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const laps = (await res.json()) as LapTelemetry[];
      if (Array.isArray(laps) && laps.length > 0) {
        return { laps, source: 'backend' };
      }
    } catch (e) {
      console.warn(`Backend at ${BASE_URL} unavailable — using synthetic telemetry:`, e);
    } finally {
      clearTimeout(timer);
    }
  }
  return { laps: buildMockSession(), source: 'synthetic' };
}

function buildMockSession(): LapTelemetry[] {
  const track = buildTrack(5);
  const configs: LapGenOptions[] = [
    { driver: 'VER', lapNumber: 32, compound: 'SOFT',
      aLatScale: 1.0,   brakeScale: 1.0,  linePhase: 0.0, lineAmp: 3.0, wobble: 0.0 },
    { driver: 'VER', lapNumber: 33, compound: 'SOFT',
      aLatScale: 0.985, brakeScale: 0.98, linePhase: 0.8, lineAmp: 3.6, wobble: 1.3 },
    { driver: 'NOR', lapNumber: 34, compound: 'SOFT',
      aLatScale: 1.005, brakeScale: 1.02, linePhase: 1.9, lineAmp: 2.4, wobble: 2.1 },
    { driver: 'NOR', lapNumber: 35, compound: 'MEDIUM',
      aLatScale: 0.995, brakeScale: 0.99, linePhase: 2.7, lineAmp: 3.1, wobble: 3.4 },
  ];
  return configs.map((cfg) => generateLap(track, cfg));
}
