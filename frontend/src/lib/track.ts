import { findCircuit, resampleClosed, type Point } from './circuits';

export interface TrackPoint {
  x: number;
  y: number;
  distance: number;   // m along the loop
  curvature: number;  // 1/m
}

export interface Track {
  points: TrackPoint[];
  ds: number;
  length: number;
}

function circumCurvature(a: Point, b: Point, c: Point): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const twiceArea = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  if (twiceArea < 1e-9 || Math.min(ab, bc, ca) < 1e-6) return 0;
  return 1 / ((ab * bc * ca) / (2 * twiceArea));
}

function smoothCircular(values: number[], loopLength: number, halfWindow: number): number[] {
  const out = new Array<number>(values.length).fill(0);
  for (let i = 0; i < loopLength; i++) {
    let sum = 0;
    for (let k = -halfWindow; k <= halfWindow; k++) {
      sum += values[(i + k + loopLength) % loopLength];
    }
    out[i] = sum / (2 * halfWindow + 1);
  }
  if (out.length > loopLength) out[out.length - 1] = out[0];
  return out;
}

/** Fallback shape for unknown Grand Prix names (the original synthetic track). */
function syntheticRaw(): Point[] {
  const raw: Point[] = [];
  const nRaw = 6000;
  for (let i = 0; i < nRaw; i++) {
    const theta = (i / nRaw) * Math.PI * 2;
    const r = 420 * (
      1 +
      0.5 * Math.sin(3 * theta) +
      0.25 * Math.sin(5 * theta + 1.1) +
      0.12 * Math.sin(8 * theta + 2.4)
    );
    raw.push([r * Math.cos(theta), r * Math.sin(theta)]);
  }
  return raw;
}

/**
 * Resampled centre-line used by the synthetic generator. `gp` selects the
 * real circuit shape from shared/circuits.json when it is known.
 */
export function buildTrack(ds = 5, gp?: string | null): Track {
  const circuit = findCircuit(gp);
  const coords = resampleClosed(circuit?.points ?? syntheticRaw(), ds);
  const n = coords.length;
  const curvature = smoothCircular(
    coords.map((p, i) =>
      circumCurvature(coords[(i - 3 + n) % n], p, coords[(i + 3) % n])),
    n, 4,
  );
  const points: TrackPoint[] = coords.map(([x, y], i) => ({
    x, y, distance: i * ds, curvature: curvature[i],
  }));
  return { points, ds, length: n * ds };
}
