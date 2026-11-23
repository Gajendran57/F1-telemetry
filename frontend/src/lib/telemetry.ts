import type { Compound, LapTelemetry, TelemetrySample } from '../types/telemetry';
import type { Track } from './track';

export interface LapGenOptions {
  driver: string;
  lapNumber: number;
  compound: Compound;
  aLatScale: number;
  brakeScale: number;
  linePhase: number;
  lineAmp: number;
  wobble: number;
}

function gearFor(kmh: number): number {
  const bands = [80, 118, 152, 188, 222, 258, 292];
  for (let g = 0; g < bands.length; g++) if (kmh < bands[g]) return g + 1;
  return 8;
}

export function generateLap(track: Track, opts: LapGenOptions): LapTelemetry {
  const pts = track.points;
  const n = pts.length;
  const ds = track.ds;

  const aLat = 40 * opts.aLatScale;
  const aAcc = 10;
  const aBrake = 42 * opts.brakeScale;
  const vMax = 85;
  const vFloor = 18;

  const v = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const k = pts[i].curvature;
    const radius = k > 1e-6 ? 1 / k : 1e6;
    const grip = 1 + 0.06 * Math.sin(pts[i].distance / 260 + opts.wobble);
    v[i] = Math.min(vMax, Math.max(vFloor, Math.sqrt(aLat * grip * radius)));
  }

  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < n; i++) {
      v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * aAcc * ds));
    }
    v[0] = Math.min(v[0], Math.sqrt(v[n - 1] ** 2 + 2 * aAcc * ds));
    for (let i = n - 2; i >= 0; i--) {
      v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * aBrake * ds));
    }
    v[n - 1] = Math.min(v[n - 1], Math.sqrt(v[0] ** 2 + 2 * aBrake * ds));
  }

  const time = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const a = v[i - 1];
    const b = v[i % n];
    time[i] = time[i - 1] + (2 * ds) / (a + b);
  }
  const lapTime = time[n];

  const samples: TelemetrySample[] = [];
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const p = pts[idx];
    const prev = pts[(idx - 1 + n) % n];
    const next = pts[(idx + 1) % n];

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const offset = opts.lineAmp * Math.sin(p.distance / 230 + opts.linePhase);

    const speedMs = v[idx];
    const speedKmh = speedMs * 3.6;
    const accel =
      i < n ? (v[(idx + 1) % n] ** 2 - v[idx] ** 2) / (2 * ds) : 0;

    const brake = accel < -1.5;
    const throttle = brake
      ? 0
      : accel > -0.3
        ? 100
        : Math.round(Math.max(30, 100 + accel * 40));

    const gear = gearFor(speedKmh);
    const bands = [0, 80, 118, 152, 188, 222, 258, 292, 400];
    const lo = bands[gear - 1];
    const hi = bands[gear];
    const rpm = Math.round(8000 + 6000 * Math.min(1, Math.max(0, (speedKmh - lo) / (hi - lo))));
    const drs = throttle === 100 && speedKmh > 250 ? 1 : 0;

    samples.push({
      distance: i * ds,
      time: time[i],
      speed: speedKmh,
      throttle,
      brake,
      gear,
      rpm,
      drs,
      x: p.x + nx * offset,
      y: p.y + ny * offset,
    });
  }

  return {
    driver: opts.driver,
    lapNumber: opts.lapNumber,
    lapTime,
    compound: opts.compound,
    samples,
  };
}
