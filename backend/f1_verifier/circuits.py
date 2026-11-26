"""Circuit centre-line data shared by the mock generator and the map.

Static outlines come from ``shared/circuits.json`` (MIT-licensed open data).
For real FastF1 sessions the outline can instead be derived from the GPS
samples of a lap, which guarantees that the map and the trajectory use exactly
the same coordinate system.
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path

from f1_verifier.schemas import CircuitOutline, LapTelemetry

_DATA_FILE = Path(__file__).resolve().parents[2] / "shared" / "circuits.json"

Point = tuple[float, float]


@lru_cache(maxsize=1)
def _data() -> dict:
    with _DATA_FILE.open(encoding="utf-8") as fh:
        return json.load(fh)


def _normalise(value: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


@lru_cache(maxsize=128)
def find_circuit(gp: str | None) -> CircuitOutline | None:
    """Resolve a Grand Prix name (FastF1 event name or friendly label)."""
    if not gp or not gp.strip():
        return None
    data = _data()
    key = _normalise(gp)
    circuit_id = data["gpAliases"].get(key)
    if circuit_id is None:
        # Be forgiving about e.g. "2024 Brazilian Grand Prix".
        for alias, value in data["gpAliases"].items():
            if alias in key or key in alias:
                circuit_id = value
                break
    if circuit_id is None:
        return None
    for item in data["circuits"]:
        if item["id"] == circuit_id:
            return CircuitOutline(
                id=item["id"],
                name=item["name"],
                country=item.get("country"),
                length=float(item["length"]),
                points=[tuple(p) for p in item["points"]],  # type: ignore[misc]
                source="circuit-data",
            )
    return None


def resample_closed(points: list[Point], ds: float = 5.0) -> list[Point]:
    """Resample a closed polyline at (approximately) fixed arc-length spacing."""
    if len(points) < 3:
        return []
    seq = list(points)
    if seq[0] != seq[-1]:
        seq.append(seq[0])
    cum = [0.0]
    for a, b in zip(seq, seq[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = cum[-1]
    if total <= 0:
        return []
    count = max(8, int(total / ds))
    step = total / count
    out: list[Point] = []
    cursor = 0
    for i in range(count):
        target = i * step
        while cursor < len(seq) - 2 and cum[cursor + 1] < target:
            cursor += 1
        seg = cum[cursor + 1] - cum[cursor] or 1.0
        t = (target - cum[cursor]) / seg
        a, b = seq[cursor], seq[cursor + 1]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def circum_curvature(a: Point, b: Point, c: Point) -> float:
    ab = math.hypot(b[0] - a[0], b[1] - a[1])
    bc = math.hypot(c[0] - b[0], c[1] - b[1])
    ca = math.hypot(a[0] - c[0], a[1] - c[1])
    area2 = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    if area2 < 1e-9 or min(ab, bc, ca) < 1e-6:
        return 0.0
    return 1.0 / ((ab * bc * ca) / (2.0 * area2))


def _downsample(points: list[Point], step_m: float = 10.0) -> list[Point]:
    if len(points) < 4:
        return points
    spacing = math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1])
    stride = max(1, round(max(step_m, spacing) / max(spacing, 1e-6)))
    out = points[::stride]
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def outline_from_laps(laps: list[LapTelemetry], step_m: float = 10.0) -> CircuitOutline | None:
    """Derive a circuit outline from the GPS of one telemetry lap."""
    for lap in laps:
        raw: list[Point] = [
            (s.x, s.y) for s in lap.samples
            if math.isfinite(s.x) and math.isfinite(s.y) and (s.x != 0.0 or s.y != 0.0)
        ]
        if len(raw) < 20:
            continue
        points = _downsample(raw, step_m)
        length = sum(
            math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])
        )
        if length < 100:
            continue
        return CircuitOutline(
            id=None,
            name="Circuit (from GPS)",
            country=None,
            length=length,
            points=points,
            source="telemetry",
        )
    return None


def circuit_response(
    gp: str | None,
    laps: list[LapTelemetry],
    source: str,
) -> CircuitOutline | None:
    """Best available outline for the current selection."""
    if source in {"fastf1", "live"}:
        outline = outline_from_laps(laps)
        if outline:
            return outline
    circuit = find_circuit(gp)
    if circuit:
        points = _downsample(resample_closed(circuit.points, 5.0), 10.0)
        length = sum(
            math.hypot(b[0] - a[0], b[1] - a[1])
            for a, b in zip(points, points[1:])
        )
        # Do not mutate the cached raw outline — the mock generator needs it.
        return circuit.model_copy(update={"points": points, "length": length})
    # Unknown GP in mock mode: fall back to whatever geometry the laps use.
    return outline_from_laps(laps)
