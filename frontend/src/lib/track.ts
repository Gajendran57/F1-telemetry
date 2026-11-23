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

function circumCurvature(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(c.x - a.x, c.y - a.y);
  const twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (twiceArea < 1e-9 || ab < 1e-6 || bc < 1e-6 || ca < 1e-6) return 0;
  const radius = (ab * bc * ca) / (2 * twiceArea);
  return 1 / radius;
}

function smoothCircular(values: number[], loopLength: number, halfWindow: number): number[] {
  const out = new Array<number>(values.length).fill(0);
  for (let i = 0; i < loopLength; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -halfWindow; k <= halfWindow; k++) {
      sum += values[(i + k + loopLength) % loopLength];
      count++;
    }
    out[i] = sum / count;
  }
  out[values.length - 1] = out[0];
  return out;
}

export function buildTrack(ds = 5): Track {
  const nRaw = 6000;
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i < nRaw; i++) {
    const theta = (i / nRaw) * Math.PI * 2;
    const r =
      420 *
      (1 +
        0.5 * Math.sin(3 * theta) +
        0.25 * Math.sin(5 * theta + 1.1) +
        0.12 * Math.sin(8 * theta + 2.4));
    raw.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
  }

  const cum = new Array<number>(raw.length).fill(0);
  for (let i = 1; i < raw.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
  }
  const totalLength = cum[cum.length - 1];

  const count = Math.floor(totalLength / ds);
  const points: TrackPoint[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const target = i * ds;
    while (cursor < cum.length - 2 && cum[cursor + 1] < target) cursor++;
    const segLen = cum[cursor + 1] - cum[cursor] || 1;
    const t = (target - cum[cursor]) / segLen;
    points.push({
      x: raw[cursor].x + (raw[cursor + 1].x - raw[cursor].x) * t,
      y: raw[cursor].y + (raw[cursor + 1].y - raw[cursor].y) * t,
      distance: target,
      curvature: 0,
    });
  }

  const n = points.length;
  const rawCurv = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    rawCurv[i] = circumCurvature(
      points[(i - 3 + n) % n],
      points[i],
      points[(i + 3) % n],
    );
  }
  const smoothed = smoothCircular(rawCurv, n, 4);
  for (let i = 0; i < n; i++) points[i].curvature = smoothed[i];

  return { points, ds, length: n * ds };
}
