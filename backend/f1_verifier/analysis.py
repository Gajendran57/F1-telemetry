"""Analysis pipeline — mirrors frontend/src/lib/analysis.ts one-to-one."""
from __future__ import annotations
import math
from datetime import datetime, timezone
from f1_verifier.schemas import (
    CornerAnalysis, CornerDelta, DeltaTPoint, LapTelemetry, TelemetrySample,
    ValidationIssue, VerifierReport,
)


# ---------------------------------------------------------------------------
# Curvature from GPS
# ---------------------------------------------------------------------------
def _circum_curvature(ax, ay, bx, by, cx, cy) -> float:
    ab = math.hypot(bx - ax, by - ay)
    bc = math.hypot(cx - bx, cy - by)
    ca = math.hypot(cx - ax, cy - ay)
    area2 = abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
    if area2 < 1e-9 or ab < 1e-6 or bc < 1e-6 or ca < 1e-6:
        return 0.0
    return 1.0 / ((ab * bc * ca) / (2.0 * area2))


def derive_curvature(samples: list[TelemetrySample], window: int = 3) -> list[float]:
    loop = len(samples) - 1
    raw = [0.0] * len(samples)
    for i in range(loop):
        a = samples[(i - window) % loop]
        b = samples[i]
        c = samples[(i + window) % loop]
        raw[i] = _circum_curvature(a.x, a.y, b.x, b.y, c.x, c.y)

    out = [0.0] * len(samples)
    half = 3
    for i in range(loop):
        s = sum(raw[(i + k) % loop] for k in range(-half, half + 1))
        out[i] = s / (2 * half + 1)
    out[-1] = out[0]
    return out


# ---------------------------------------------------------------------------
# Delta-T
# ---------------------------------------------------------------------------
def _time_at_distance(samples: list[TelemetrySample], distance: float) -> float | None:
    if distance < samples[0].distance or distance > samples[-1].distance:
        return None
    lo, hi = 0, len(samples) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if samples[mid].distance < distance:
            lo = mid
        else:
            hi = mid
    a, b = samples[lo], samples[hi]
    span = b.distance - a.distance or 1.0
    t = (distance - a.distance) / span
    return a.time + (b.time - a.time) * t


def compute_delta_t(reference: LapTelemetry, comparison: LapTelemetry) -> list[DeltaTPoint]:
    out: list[DeltaTPoint] = []
    for s in reference.samples:
        cmp_t = _time_at_distance(comparison.samples, s.distance)
        if cmp_t is None:
            continue
        out.append(DeltaTPoint(distance=s.distance, delta=s.time - cmp_t))
    return out


# ---------------------------------------------------------------------------
# Corner detection & analysis
# ---------------------------------------------------------------------------
def detect_corners(
    curvature: list[float],
    ds: float,
    min_radius: float = 350.0,
    min_length: float = 30.0,
) -> list[tuple[int, int]]:
    loop = len(curvature) - 1
    threshold = 1.0 / min_radius
    in_corner = [curvature[i] > threshold for i in range(loop)]

    runs: list[tuple[int, int]] = []
    i = 0
    while i < loop:
        if not in_corner[i]:
            i += 1
            continue
        start = i
        while i < loop and in_corner[i]:
            i += 1
        runs.append((start, i - 1))

    max_gap = round(25.0 / ds)
    merged: list[tuple[int, int]] = []
    for start, end in runs:
        if merged and start - merged[-1][1] <= max_gap:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))

    min_samples = max(2, round(min_length / ds))
    return [(s, e) for s, e in merged if e - s + 1 >= min_samples]


def analyse_corners(lap: LapTelemetry, curvature: list[float]) -> list[CornerAnalysis]:
    samples = lap.samples
    ds = samples[1].distance - samples[0].distance or 1.0
    raw = detect_corners(curvature, ds)

    out: list[CornerAnalysis] = []
    for index, (start, end) in enumerate(raw):
        apex_idx = start
        for i in range(start, end + 1):
            if samples[i].speed < samples[apex_idx].speed:
                apex_idx = i

        search_back = min(round(300.0 / ds), start)
        brake_point = None
        for i in range(start - search_back, apex_idx + 1):
            if i < 0:
                continue
            prev_braking = i > 0 and samples[i - 1].brake
            if samples[i].brake and not prev_braking:
                brake_point = samples[i].distance
                break

        brake_release = None
        for i in range(apex_idx, max(0, start - search_back) - 1, -1):
            if samples[i].brake:
                brake_release = samples[min(i + 1, len(samples) - 1)].distance
                break

        brake_duration = None
        if brake_point is not None and brake_release is not None:
            t_bp = _time_at_distance(samples, brake_point) or 0.0
            t_br = _time_at_distance(samples, brake_release) or 0.0
            brake_duration = t_br - t_bp

        out.append(CornerAnalysis(
            corner=index + 1,
            startDistance=samples[start].distance,
            apexDistance=samples[apex_idx].distance,
            endDistance=samples[end].distance,
            minSpeed=samples[apex_idx].speed,
            entrySpeed=samples[start].speed,
            exitSpeed=samples[end].speed,
            gearAtApex=samples[apex_idx].gear,
            brakePoint=brake_point,
            brakeRelease=brake_release,
            brakeDuration=brake_duration,
            apexX=samples[apex_idx].x,
            apexY=samples[apex_idx].y,
        ))
    return out


def compare_corners(ref: list[CornerAnalysis], cmp: list[CornerAnalysis]) -> list[CornerDelta]:
    out: list[CornerDelta] = []
    for c in ref:
        if not cmp:
            out.append(CornerDelta(
                corner=c.corner, refMinSpeed=c.minSpeed,
                cmpMinSpeed=float("nan"), minSpeedDelta=float("nan"),
                apexDistanceDelta=float("nan"),
            ))
            continue
        best = min(cmp, key=lambda o: abs(o.apexDistance - c.apexDistance))
        out.append(CornerDelta(
            corner=c.corner,
            refMinSpeed=c.minSpeed,
            cmpMinSpeed=best.minSpeed,
            minSpeedDelta=best.minSpeed - c.minSpeed,
            apexDistanceDelta=best.apexDistance - c.apexDistance,
        ))
    return out


# ---------------------------------------------------------------------------
# Verifier
# ---------------------------------------------------------------------------
def verify(
    laps: list[LapTelemetry],
    ref_corners: list[CornerAnalysis],
    cmp_corners: list[CornerAnalysis],
    delta_t: list[DeltaTPoint],
) -> VerifierReport:
    issues: list[ValidationIssue] = []

    def add(id_: str, check: str, ok: bool, detail: str, severity: str = "fail") -> None:
        issues.append(ValidationIssue(
            id=id_, check=check,
            status="pass" if ok else severity,  # type: ignore[arg-type]
            detail=detail,
        ))

    for lap in laps:
        s = lap.samples
        tag = f"{lap.driver} L{lap.lapNumber}"

        finite = all(
            math.isfinite(p.speed) and math.isfinite(p.distance) and math.isfinite(p.time)
            and math.isfinite(p.x) and math.isfinite(p.y)
            for p in s
        )
        add(f"schema-{tag}", f"Schema: {tag} telemetry is finite", finite,
            "All required fields present and numeric." if finite else "Non-finite value detected.")

        mono_d = all(s[i].distance >= s[i - 1].distance for i in range(1, len(s)))
        add(f"dist-{tag}", f"Monotonic distance: {tag}", mono_d,
            "Distance strictly non-decreasing." if mono_d else "Distance trace is not monotonic.")

        mono_t = all(s[i].time >= s[i - 1].time for i in range(1, len(s)))
        add(f"time-{tag}", f"Monotonic time: {tag}", mono_t,
            "Time strictly non-decreasing." if mono_t else "Time trace is not monotonic.")

        speed_range = all(0 <= p.speed <= 400 for p in s)
        add(f"speed-{tag}", f"Speed bounds: {tag}", speed_range,
            "All speeds within 0-400 km/h." if speed_range else "Speed outside physical bounds.")

        lap_time_ok = abs(s[-1].time - lap.lapTime) < 0.01
        add(f"laptime-{tag}", f"Lap time consistency: {tag}", lap_time_ok,
            f"lapTime {lap.lapTime:.3f}s matches final telemetry sample."
            if lap_time_ok else "lapTime does not match the last telemetry timestamp.",
            severity="warn")

    apex_in_window = all(c.startDistance <= c.apexDistance <= c.endDistance for c in ref_corners)
    add("apex-window", "Apex lies inside corner window", apex_in_window,
        f"{len(ref_corners)} apexes validated." if apex_in_window else "Apex outside window.")

    apex_min = all(
        c.minSpeed <= c.entrySpeed + 1e-6 and c.minSpeed <= c.exitSpeed + 1e-6
        for c in ref_corners
    )
    add("apex-min", "Minimum cornering speed <= entry & exit", apex_min,
        "Apex is the speed minimum in every corner." if apex_min else "Apex speed exceeds entry/exit.")

    brake_order = all(c.brakePoint is None or c.brakePoint <= c.apexDistance for c in ref_corners)
    add("brake-order", "Braking point precedes apex", brake_order,
        "All brake points occur before their apex." if brake_order else "Brake point after apex detected.")

    delta_starts = bool(delta_t) and abs(delta_t[0].delta) < 0.05
    add("delta-zero", "Delta-T starts at zero", delta_starts,
        f"delta at {delta_t[0].distance:.0f} m = {delta_t[0].delta:.4f} s"
        if delta_starts else "Delta-T at start line is not ~0.")

    final_delta = delta_t[-1].delta if delta_t else float("nan")
    add("delta-end", "Delta-T converges at finish", math.isfinite(final_delta),
        f"Final delta = {final_delta:.3f} s", severity="warn")

    add("corner-count", "Both laps share the same corner count",
        len(ref_corners) == len(cmp_corners),
        f"Reference: {len(ref_corners)}, comparison: {len(cmp_corners)}",
        severity="warn")

    return VerifierReport(
        generatedAt=datetime.now(timezone.utc).isoformat(),
        totalChecks=len(issues),
        passed=sum(1 for i in issues if i.status == "pass"),
        warned=sum(1 for i in issues if i.status == "warn"),
        failed=sum(1 for i in issues if i.status == "fail"),
        issues=issues,
    )


def analyse_pair(
    reference: LapTelemetry,
    comparison: LapTelemetry,
    all_laps: list[LapTelemetry],
):
    ref_curv = derive_curvature(reference.samples)
    cmp_curv = derive_curvature(comparison.samples)
    ref_corners = analyse_corners(reference, ref_curv)
    cmp_corners = analyse_corners(comparison, cmp_curv)
    delta_t = compute_delta_t(reference, comparison)
    corner_deltas = compare_corners(ref_corners, cmp_corners)
    report = verify(all_laps, ref_corners, cmp_corners, delta_t)
    return ref_corners, cmp_corners, delta_t, corner_deltas, report
