"""Chooses between FastF1 and the synthetic mock, caching the result."""
from __future__ import annotations

import json
import time
from typing import Any

from f1_verifier.config import resolve_settings
from f1_verifier.mock_source import build_session
from f1_verifier.schemas import DataSource, LapTelemetry, SessionSelection

# One cache entry per effective session selection so UI overrides never leak
# into each other (or into the .env defaults).
_cache: dict[str, dict[str, Any]] = {}
TTL = 60  # seconds


def _selection_key(effective: Any) -> str:
    return json.dumps(
        {
            "source": effective.data_source,
            "year": effective.fastf1_year,
            "gp": effective.fastf1_gp,
            "session": effective.fastf1_session,
            "drivers": effective.fastf1_drivers,
            "cacheDir": effective.fastf1_cache_dir,
            "liveFile": effective.fastf1_live_file,
            "laps": effective.fastf1_laps,
            "fallback": effective.allow_mock_fallback,
        },
        sort_keys=True,
    )


def load_laps(
    force: bool = False,
    overrides: SessionSelection | None = None,
) -> tuple[list[LapTelemetry], DataSource]:
    effective = resolve_settings(overrides)
    key = _selection_key(effective)
    entry = _cache.get(key)
    if entry and not force and time.time() - float(entry["ts"]) < TTL:
        return entry["laps"], entry["source"]  # type: ignore[return-value]

    try:
        if effective.data_source != "fastf1":
            laps, source = build_session(
                drivers=effective.fastf1_drivers,
                lap_selection=effective.fastf1_laps,
                gp=effective.fastf1_gp,
            ), "mock"
        else:
            from f1_verifier.fastf1_source import load_from_fastf1

            laps, source = load_from_fastf1(
                year=effective.fastf1_year,
                gp=effective.fastf1_gp,
                session=effective.fastf1_session,
                drivers=effective.fastf1_drivers,
                cache_dir=effective.fastf1_cache_dir,
                live_file=effective.fastf1_live_file,
                lap_selection=effective.fastf1_laps,
            )
            if not laps:
                raise RuntimeError("empty result")
            print(f"[data_source] {source} loaded {len(laps)} laps.")
    except Exception as e:  # noqa: BLE001
        if not effective.allow_mock_fallback:
            raise
        print(f"[data_source] {e!r} — falling back to mock.")
        laps, source = build_session(
            drivers=effective.fastf1_drivers,
            lap_selection=effective.fastf1_laps,
            gp=effective.fastf1_gp,
        ), "mock"

    _cache[key] = {"laps": laps, "source": source, "ts": time.time()}
    return laps, source  # type: ignore[return-value]


def clear_cache() -> None:
    _cache.clear()
