import circuitData from '../data/circuits.json';
import type { CircuitOutline, LapTelemetry } from '../types/telemetry';

/**
 * Offline copy of the circuit outlines served by the backend. Keeping the
 * lookup in the browser lets the synthetic fallback draw the same circuit as
 * the selected Grand Prix.
 */
interface CircuitRecord {
  id: string;
  name: string;
  country: string;
  length: number;
  points: Array<[number, number]>;
}

interface CircuitData {
  gpAliases: Record<string, string>;
  circuits: CircuitRecord[];
}

const DATA = circuitData as unknown as CircuitData;
const BY_ID = new Map(DATA.circuits.map((c) => [c.id, c]));

export type Point = [number, number];

const normalise = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export function findCircuit(gp?: string | null): CircuitOutline | null {
  if (!gp?.trim()) return null;
  const key = normalise(gp);
  let id = DATA.gpAliases[key];
  if (!id) {
    for (const [alias, value] of Object.entries(DATA.gpAliases)) {
      if (alias.includes(key) || key.includes(alias)) {
        id = value;
        break;
      }
    }
  }
  const circuit = id ? BY_ID.get(id) : undefined;
  if (!circuit) return null;
  return {
    id: circuit.id,
    name: circuit.name,
    country: circuit.country,
    length: circuit.length,
    points: circuit.points.map(([x, y]) => [x, y]),
    source: 'circuit-data',
  };
}

/** Resample a closed polyline at approximately fixed arc-length spacing. */
export function resampleClosed(points: Point[], ds = 5): Point[] {
  if (points.length < 3) return [];
  const seq = [...points];
  if (seq[0][0] !== seq[seq.length - 1][0] || seq[0][1] !== seq[seq.length - 1][1]) {
    seq.push(seq[0]);
  }
  const cum = [0];
  for (let i = 1; i < seq.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (!Number.isFinite(total) || total <= 0) return [];
  const count = Math.max(8, Math.floor(total / ds));
  const step = total / count;
  const out: Point[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (cursor < seq.length - 2 && cum[cursor + 1] < target) cursor++;
    const seg = cum[cursor + 1] - cum[cursor] || 1;
    const t = (target - cum[cursor]) / seg;
    const [ax, ay] = seq[cursor];
    const [bx, by] = seq[cursor + 1];
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return out;
}

export function downsample(points: Point[], stepM = 10): Point[] {
  if (points.length < 4) return points;
  const spacing = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
  const stride = Math.max(1, Math.round(Math.max(stepM, spacing) / Math.max(spacing, 1e-6)));
  const out = points.filter((_, i) => i % stride === 0);
  if (out[0] !== out[out.length - 1]) out.push(out[0]);
  return out;
}

export function outlineFromLaps(laps: LapTelemetry[], stepM = 10): CircuitOutline | null {
  for (const lap of laps) {
    const raw: Point[] = lap.samples
      .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && (s.x !== 0 || s.y !== 0))
      .map((s) => [s.x, s.y] as Point);
    if (raw.length < 20) continue;
    const points = downsample(raw, stepM);
    const length = points.slice(1).reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0,
    );
    if (length < 100) continue;
    return { name: 'Circuit (from GPS)', length, points, source: 'telemetry' };
  }
  return null;
}

/** Outline for the offline path: prefer the GP shape, else derive from GPS. */
export function localCircuitOutline(
  gp: string | null | undefined,
  laps: LapTelemetry[],
): CircuitOutline | null {
  const circuit = findCircuit(gp);
  if (circuit) {
    circuit.points = downsample(resampleClosed(circuit.points, 5), 10);
    circuit.length = circuit.points.slice(1).reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - circuit.points[i][0], p[1] - circuit.points[i][1]),
      0,
    );
    return circuit;
  }
  return outlineFromLaps(laps);
}
