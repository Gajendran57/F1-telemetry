"""Deterministic synthetic circuit — mirrors frontend/src/lib/track.ts and telemetry.ts."""
from __future__ import annotations
import math
from dataclasses import dataclass
from f1_verifier.schemas import Compound, LapTelemetry, TelemetrySample


@dataclass
class TrackPoint:
    x: float
    y: float
    distance: float
    curvature: float = 0.0


def _circum_curvature(ax, ay, bx, by, cx, cy) -> float:
    ab = math.hypot(bx - ax, by - ay)
    bc = math.hypot(cx - bx, cy - by)
    ca = math.hypot(cx - ax, cy - ay)
    area2 = abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
    if area2 < 1e-9 or ab < 1e-6 or bc < 1e-6 or ca < 1e-6:
        return 0.0
    return 1.0 / ((ab * bc * ca) / (2.0 * area2))


def build_track(ds: float = 5.0) -> list[TrackPoint]:
    n_raw = 6000
    raw: list[tuple[float, float]] = []
    for i in range(n_raw):
        theta = (i / n_raw) * 2.0 * math.pi
        r = 420.0 * (
            1.0
            + 0.5 * math.sin(3 * theta)
            + 0.25 * math.sin(5 * theta + 1.1)
            + 0.12 * math.sin(8 * theta + 2.4)
        )
        raw.append((r * math.cos(theta), r * math.sin(theta)))

    cum = [0.0] * n_raw
    for i in range(1, n_raw):
        cum[i] = cum[i - 1] + math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1])
    total = cum[-1]

    count = int(total / ds)
    points: list[TrackPoint] = []
    cursor = 0
    for i in range(count):
        target = i * ds
        while cursor < n_raw - 2 and cum[cursor + 1] < target:
            cursor += 1
        seg = cum[cursor + 1] - cum[cursor] or 1.0
        t = (target - cum[cursor]) / seg
        points.append(TrackPoint(
            x=raw[cursor][0] + (raw[cursor + 1][0] - raw[cursor][0]) * t,
            y=raw[cursor][1] + (raw[cursor + 1][1] - raw[cursor][1]) * t,
            distance=target,
        ))

    n = len(points)
    raw_curv = [0.0] * n
    for i in range(n):
        a = points[(i - 3) % n]
        b = points[i]
        c = points[(i + 3) % n]
        raw_curv[i] = _circum_curvature(a.x, a.y, b.x, b.y, c.x, c.y)

    half = 4
    for i in range(n):
        s = sum(raw_curv[(i + k) % n] for k in range(-half, half + 1))
        points[i].curvature = s / (2 * half + 1)

    return points


def _gear_for(kmh: float) -> int:
    bands = [80, 118, 152, 188, 222, 258, 292]
    for g, b in enumerate(bands):
        if kmh < b:
            return g + 1
    return 8


def _rpm_for(kmh: float, gear: int) -> int:
    bands = [0, 80, 118, 152, 188, 222, 258, 292, 400]
    lo, hi = bands[gear - 1], bands[gear]
    return int(8000 + 6000 * min(1.0, max(0.0, (kmh - lo) / (hi - lo))))


def generate_lap(
    track: list[TrackPoint],
    *,
    driver: str,
    lap_number: int,
    compound: Compound,
    a_lat_scale: float,
    brake_scale: float,
    line_phase: float,
    line_amp: float,
    wobble: float,
    ds: float = 5.0,
) -> LapTelemetry:
    n = len(track)
    a_lat = 40.0 * a_lat_scale
    a_acc = 10.0
    a_brake = 42.0 * brake_scale
    v_max = 85.0
    v_floor = 18.0

    v = [0.0] * n
    for i, p in enumerate(track):
        k = p.curvature
        radius = 1.0 / k if k > 1e-6 else 1e6
        grip = 1.0 + 0.06 * math.sin(p.distance / 260.0 + wobble)
        v[i] = min(v_max, max(v_floor, math.sqrt(a_lat * grip * radius)))

    for _ in range(4):
        for i in range(1, n):
            v[i] = min(v[i], math.sqrt(v[i - 1] ** 2 + 2 * a_acc * ds))
        v[0] = min(v[0], math.sqrt(v[n - 1] ** 2 + 2 * a_acc * ds))
        for i in range(n - 2, -1, -1):
            v[i] = min(v[i], math.sqrt(v[i + 1] ** 2 + 2 * a_brake * ds))
        v[n - 1] = min(v[n - 1], math.sqrt(v[0] ** 2 + 2 * a_brake * ds))

    time_arr = [0.0] * (n + 1)
    for i in range(1, n + 1):
        a, b = v[i - 1], v[i % n]
        time_arr[i] = time_arr[i - 1] + (2.0 * ds) / (a + b)
    lap_time = time_arr[n]

    samples: list[TelemetrySample] = []
    for i in range(n + 1):
        idx = i % n
        p = track[idx]
        prev = track[(idx - 1) % n]
        nxt = track[(idx + 1) % n]

        dx, dy = nxt.x - prev.x, nxt.y - prev.y
        length = math.hypot(dx, dy) or 1.0
        dx, dy = dx / length, dy / length
        nx, ny = -dy, dx
        offset = line_amp * math.sin(p.distance / 230.0 + line_phase)

        speed_kmh = v[idx] * 3.6
        accel = (v[(idx + 1) % n] ** 2 - v[idx] ** 2) / (2 * ds) if i < n else 0.0

        brake = accel < -1.5
        if brake:
            throttle = 0.0
        elif accel > -0.3:
            throttle = 100.0
        else:
            throttle = max(30.0, 100.0 + accel * 40.0)

        gear = _gear_for(speed_kmh)
        rpm = _rpm_for(speed_kmh, gear)
        drs = 1 if (throttle == 100.0 and speed_kmh > 250.0) else 0

        samples.append(TelemetrySample(
            distance=i * ds,
            time=time_arr[i],
            speed=speed_kmh,
            throttle=throttle,
            brake=brake,
            gear=gear,
            rpm=rpm,
            drs=drs,
            x=p.x + nx * offset,
            y=p.y + ny * offset,
        ))

    return LapTelemetry(
        driver=driver,
        lapNumber=lap_number,
        lapTime=lap_time,
        compound=compound,
        samples=samples,
    )


def build_session() -> list[LapTelemetry]:
    track = build_track(5.0)
    configs = [
        dict(driver="VER", lap_number=32, compound="SOFT",
             a_lat_scale=1.0,   brake_scale=1.0,  line_phase=0.0, line_amp=3.0, wobble=0.0),
        dict(driver="VER", lap_number=33, compound="SOFT",
             a_lat_scale=0.985, brake_scale=0.98, line_phase=0.8, line_amp=3.6, wobble=1.3),
        dict(driver="NOR", lap_number=34, compound="SOFT",
             a_lat_scale=1.005, brake_scale=1.02, line_phase=1.9, line_amp=2.4, wobble=2.1),
        dict(driver="NOR", lap_number=35, compound="MEDIUM",
             a_lat_scale=0.995, brake_scale=0.99, line_phase=2.7, line_amp=3.1, wobble=3.4),
    ]
    return [generate_lap(track, **cfg) for cfg in configs]
