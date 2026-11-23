import type {
  CornerAnalysis,
  CornerDelta,
  DeltaTPoint,
  LapTelemetry,
  TelemetrySample,
  ValidationIssue,
  VerifierReport,
} from '../types/telemetry';

function circumCurvature(a: TelemetrySample, b: TelemetrySample, c: TelemetrySample): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(c.x - a.x, c.y - a.y);
  const twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (twiceArea < 1e-9 || ab < 1e-6 || bc < 1e-6 || ca < 1e-6) return 0;
  return 1 / ((ab * bc * ca) / (2 * twiceArea));
}

export function deriveCurvature(samples: TelemetrySample[], window = 3): number[] {
  const loopLength = samples.length - 1;
  const raw = new Array<number>(samples.length).fill(0);
  for (let i = 0; i < loopLength; i++) {
    raw[i] = circumCurvature(
      samples[(i - window + loopLength) % loopLength],
      samples[i],
      samples[(i + window) % loopLength],
    );
  }
  const out = new Array<number>(samples.length).fill(0);
  const half = 3;
  for (let i = 0; i < loopLength; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += raw[(i + k + loopLength) % loopLength];
    out[i] = sum / (2 * half + 1);
  }
  out[samples.length - 1] = out[0];
  return out;
}

function timeAtDistance(samples: TelemetrySample[], distance: number): number | null {
  if (distance < samples[0].distance || distance > samples[samples.length - 1].distance) {
    return null;
  }
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].distance < distance) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.distance - a.distance || 1;
  const t = (distance - a.distance) / span;
  return a.time + (b.time - a.time) * t;
}

export function computeDeltaT(
  reference: LapTelemetry,
  comparison: LapTelemetry,
): DeltaTPoint[] {
  const out: DeltaTPoint[] = [];
  for (const sample of reference.samples) {
    const cmpTime = timeAtDistance(comparison.samples, sample.distance);
    if (cmpTime === null) continue;
    out.push({ distance: sample.distance, delta: sample.time - cmpTime });
  }
  return out;
}

export interface Corner {
  start: number;
  end: number;
  apex: number;
}

export function detectCorners(
  curvature: number[],
  ds: number,
  minRadius = 350,
  minLength = 30,
): Corner[] {
  const loopLength = curvature.length - 1;
  const threshold = 1 / minRadius;

  const inCorner = new Array<boolean>(loopLength);
  for (let i = 0; i < loopLength; i++) inCorner[i] = curvature[i] > threshold;

  const runs: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < loopLength) {
    if (!inCorner[i]) { i++; continue; }
    const start = i;
    while (i < loopLength && inCorner[i]) i++;
    runs.push({ start, end: i - 1 });
  }

  const maxGap = Math.round(25 / ds);
  const merged: Array<{ start: number; end: number }> = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.start - last.end <= maxGap) last.end = run.end;
    else merged.push({ ...run });
  }

  const minSamples = Math.max(2, Math.round(minLength / ds));
  const corners: Corner[] = [];
  for (const run of merged) {
    if (run.end - run.start + 1 < minSamples) continue;
    corners.push({ start: run.start, end: run.end, apex: run.start });
  }
  return corners;
}

export function analyseCorners(
  lap: LapTelemetry,
  curvature: number[],
): CornerAnalysis[] {
  const samples = lap.samples;
  const ds = samples[1].distance - samples[0].distance || 1;
  const corners = detectCorners(curvature, ds);

  return corners.map((corner, index) => {
    let apexIdx = corner.start;
    for (let i = corner.start; i <= corner.end; i++) {
      if (samples[i].speed < samples[apexIdx].speed) apexIdx = i;
    }

    const searchBack = Math.min(Math.round(300 / ds), corner.start);
    let brakePoint: number | null = null;
    for (let i = corner.start - searchBack; i <= apexIdx; i++) {
      if (i < 0) continue;
      const prevBraking = i > 0 && samples[i - 1].brake;
      if (samples[i].brake && !prevBraking) {
        brakePoint = samples[i].distance;
        break;
      }
    }

    let brakeRelease: number | null = null;
    for (let i = apexIdx; i >= Math.max(0, corner.start - searchBack); i--) {
      if (samples[i].brake) {
        brakeRelease = samples[Math.min(i + 1, samples.length - 1)].distance;
        break;
      }
    }

    const brakeDuration =
      brakePoint !== null && brakeRelease !== null
        ? (timeAtDistance(samples, brakeRelease) ?? 0) -
          (timeAtDistance(samples, brakePoint) ?? 0)
        : null;

    return {
      corner: index + 1,
      startDistance: samples[corner.start].distance,
      apexDistance: samples[apexIdx].distance,
      endDistance: samples[corner.end].distance,
      minSpeed: samples[apexIdx].speed,
      entrySpeed: samples[corner.start].speed,
      exitSpeed: samples[corner.end].speed,
      gearAtApex: samples[apexIdx].gear,
      brakePoint,
      brakeRelease,
      brakeDuration,
      apexX: samples[apexIdx].x,
      apexY: samples[apexIdx].y,
    };
  });
}

export function compareCorners(
  ref: CornerAnalysis[],
  cmp: CornerAnalysis[],
): CornerDelta[] {
  return ref.map((c) => {
    let best = cmp[0];
    let bestDist = Infinity;
    for (const other of cmp) {
      const d = Math.abs(other.apexDistance - c.apexDistance);
      if (d < bestDist) { bestDist = d; best = other; }
    }
    return {
      corner: c.corner,
      refMinSpeed: c.minSpeed,
      cmpMinSpeed: best?.minSpeed ?? NaN,
      minSpeedDelta: (best?.minSpeed ?? NaN) - c.minSpeed,
      apexDistanceDelta: (best?.apexDistance ?? NaN) - c.apexDistance,
    };
  });
}

function issue(
  id: string,
  check: string,
  ok: boolean,
  detail: string,
  severity: 'warn' | 'fail' = 'fail',
): ValidationIssue {
  return { id, check, status: ok ? 'pass' : severity, detail };
}

export function verify(
  laps: LapTelemetry[],
  refCorners: CornerAnalysis[],
  cmpCorners: CornerAnalysis[],
  deltaT: DeltaTPoint[],
): VerifierReport {
  const issues: ValidationIssue[] = [];

  for (const lap of laps) {
    const s = lap.samples;
    const tag = `${lap.driver} L${lap.lapNumber}`;

    const finite = s.every(
      (p) =>
        Number.isFinite(p.speed) && Number.isFinite(p.distance) &&
        Number.isFinite(p.time) && Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    issues.push(issue(`schema-${tag}`, `Schema: ${tag} telemetry is finite`, finite,
      finite ? 'All required fields present and numeric.' : 'Non-finite value detected.'));

    let monoD = true, monoT = true;
    for (let i = 1; i < s.length; i++) {
      if (s[i].distance < s[i - 1].distance) monoD = false;
      if (s[i].time < s[i - 1].time) monoT = false;
    }
    issues.push(issue(`dist-${tag}`, `Monotonic distance: ${tag}`, monoD,
      monoD ? 'Distance strictly non-decreasing.' : 'Distance trace is not monotonic.'));
    issues.push(issue(`time-${tag}`, `Monotonic time: ${tag}`, monoT,
      monoT ? 'Time strictly non-decreasing.' : 'Time trace is not monotonic.'));

    const speedRange = s.every((p) => p.speed >= 0 && p.speed <= 400);
    issues.push(issue(`speed-${tag}`, `Speed bounds: ${tag}`, speedRange,
      speedRange ? 'All speeds within 0–400 km/h.' : 'Speed outside physical bounds.'));

    const lapTimeOk = Math.abs(s[s.length - 1].time - lap.lapTime) < 0.01;
    issues.push(issue(`laptime-${tag}`, `Lap time consistency: ${tag}`, lapTimeOk,
      lapTimeOk ? `lapTime ${lap.lapTime.toFixed(3)}s matches final telemetry sample.`
                : 'lapTime does not match the last telemetry timestamp.', 'warn'));
  }

  const apexInsideWindow = refCorners.every(
    (c) => c.apexDistance >= c.startDistance && c.apexDistance <= c.endDistance,
  );
  issues.push(issue('apex-window', 'Apex lies inside corner window', apexInsideWindow,
    apexInsideWindow ? `${refCorners.length} apexes validated.` : 'Apex outside window.'));

  const apexIsSlowest = refCorners.every(
    (c) => c.minSpeed <= c.entrySpeed + 1e-6 && c.minSpeed <= c.exitSpeed + 1e-6,
  );
  issues.push(issue('apex-min', 'Minimum cornering speed ≤ entry & exit', apexIsSlowest,
    apexIsSlowest ? 'Apex is the speed minimum in every corner.' : 'Apex speed exceeds entry/exit.'));

  const brakeBeforeApex = refCorners.every(
    (c) => c.brakePoint === null || c.brakePoint <= c.apexDistance,
  );
  issues.push(issue('brake-order', 'Braking point precedes apex', brakeBeforeApex,
    brakeBeforeApex ? 'All brake points occur before their apex.' : 'Brake point after apex detected.'));

  const deltaStartsAtZero = deltaT.length > 0 && Math.abs(deltaT[0].delta) < 0.05;
  issues.push(issue('delta-zero', 'Delta-T starts at zero', deltaStartsAtZero,
    deltaStartsAtZero
      ? `Δ at ${deltaT[0]?.distance.toFixed(0)} m = ${deltaT[0]?.delta.toFixed(4)} s`
      : 'Delta-T at the start line is not ~0.'));

  const finalDelta = deltaT[deltaT.length - 1]?.delta ?? NaN;
  issues.push(issue('delta-end', 'Delta-T converges at finish', Number.isFinite(finalDelta),
    `Final Δ = ${finalDelta.toFixed(3)} s`, 'warn'));

  issues.push(issue('corner-count', 'Both laps share the same corner count',
    refCorners.length === cmpCorners.length,
    `Reference: ${refCorners.length}, comparison: ${cmpCorners.length}`, 'warn'));

  const passed = issues.filter((i) => i.status === 'pass').length;
  const warned = issues.filter((i) => i.status === 'warn').length;
  const failed = issues.filter((i) => i.status === 'fail').length;

  return {
    generatedAt: new Date().toISOString(),
    totalChecks: issues.length,
    passed, warned, failed, issues,
  };
}
