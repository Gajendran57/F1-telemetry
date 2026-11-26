import type {
  CircuitOutline,
  DataSource,
  LapTelemetry,
  OptionsResponse,
  SessionSelection,
} from '../types/telemetry';
import { localCircuitOutline } from '../lib/circuits';
import { buildTrack } from '../lib/track';
import { generateLap, type LapGenOptions } from '../lib/telemetry';
import { localOptions } from '../lib/options';

const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export interface SessionData {
  laps: LapTelemetry[];
  source: DataSource;
  circuit?: CircuitOutline | null;
}

interface LapsResponse {
  laps: LapTelemetry[];
  source: DataSource;
  circuit?: CircuitOutline | null;
}

/** Serialises UI selections into the query params understood by the backend. */
export function selectionParams(selection: SessionSelection = {}): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | boolean | null | undefined) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  };
  set('source', selection.source);
  set('year', selection.year);
  set('gp', selection.gp);
  set('session', selection.session);
  set('cacheDir', selection.cacheDir);
  set('liveFile', selection.liveFile);
  set('laps', selection.laps);
  set('allowMockFallback', selection.allowMockFallback);
  for (const driver of selection.drivers ?? []) {
    if (driver.trim()) params.append('drivers', driver.trim());
  }
  return params;
}

/**
 * Tries the FastAPI backend first (if VITE_API_BASE_URL is set), and falls
 * back to the deterministic synthetic dataset if the backend is unreachable
 * or times out. This keeps the UI usable during development.
 */
export async function fetchSessionLaps(options?: {
  force?: boolean;
  selection?: SessionSelection;
}): Promise<SessionData> {
  if (BASE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const params = selectionParams(options?.selection);
      if (options?.force) params.set('force', 'true');
      const suffix = params.toString();
      const res = await fetch(`${BASE_URL}/api/v1/laps${suffix ? `?${suffix}` : ''}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`;
        try {
          const err = (await res.json()) as { detail?: string };
          if (err?.detail) detail = err.detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const body = (await res.json()) as LapsResponse | LapTelemetry[];
      if (Array.isArray(body)) {
        if (body.length > 0) return { laps: body, source: 'fastf1' };
      } else if (Array.isArray(body?.laps) && body.laps.length > 0) {
        return {
          laps: body.laps,
          source: body.source ?? 'fastf1',
          circuit: body.circuit ?? null,
        };
      }
      throw new Error('Backend returned no laps');
    } catch (e) {
      // Surface backend/data errors; only fall back for network/unreachable failures.
      if (e instanceof Error && !/Failed to fetch|NetworkError|aborted/i.test(e.message)) {
        throw e;
      }
      console.warn(`Backend at ${BASE_URL} unavailable — using synthetic telemetry:`, e);
    } finally {
      clearTimeout(timer);
    }
  }
  return buildMockSession(options?.selection);
}

/** Selector metadata (and .env defaults) from the backend, with offline fallback. */
export async function fetchOptions(year?: number): Promise<OptionsResponse> {
  if (BASE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const query = year ? `?year=${year}` : '';
      const res = await fetch(`${BASE_URL}/api/v1/options${query}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as OptionsResponse;
    } catch (e) {
      console.warn('Could not load selector options — using offline defaults:', e);
    } finally {
      clearTimeout(timer);
    }
  }
  return localOptions(year);
}

function parseLapSelection(raw: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const part of raw.split(',')) {
    const [driver, numbers = ''] = part.split(':', 2);
    const code = driver.trim().toUpperCase();
    if (!code) continue;
    const laps = numbers.replace(/[|;]/g, ',').split(',')
      .map((n) => Number.parseInt(n.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (laps.length) out[code] = laps;
  }
  return out;
}

function buildMockSession(selection?: SessionSelection): SessionData {
  // Offline mode has no backend .env defaults; use the same default GP the
  // offline option list advertises so the first load is already circuit-accurate.
  const gp = selection?.gp ?? localOptions().defaults.gp;
  const track = buildTrack(5, gp);
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

  const drivers = (selection?.drivers ?? []).map((d) => d.trim().toUpperCase()).filter(Boolean);
  const generateAll = () => configs.map((cfg) => generateLap(track, cfg));
  const laps = !drivers.length ? generateAll() : (() => {
    const requested = parseLapSelection(selection?.laps ?? '');
    const generated: LapTelemetry[] = [];
    drivers.forEach((driver, i) => {
      const numbers = requested[driver] ?? [32 + 2 * i, 33 + 2 * i];
      numbers.forEach((lapNumber, j) => {
        const template = configs[(i + j) % configs.length];
        generated.push(generateLap(track, { ...template, driver, lapNumber }));
      });
    });
    return generated.length ? generated : generateAll();
  })();

  return {
    laps,
    source: 'synthetic',
    circuit: localCircuitOutline(gp, laps),
  };
}
