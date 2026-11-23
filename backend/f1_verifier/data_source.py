"""Chooses between FastF1 and the synthetic mock, caching the result."""
from __future__ import annotations
from functools import lru_cache

from f1_verifier.config import settings
from f1_verifier.mock_source import build_session
from f1_verifier.schemas import LapTelemetry


@lru_cache(maxsize=1)
def load_laps() -> list[LapTelemetry]:
    if settings.data_source == "fastf1":
        try:
            from f1_verifier.fastf1_source import load_from_fastf1
            laps = load_from_fastf1(
                year=settings.fastf1_year,
                gp=settings.fastf1_gp,
                session=settings.fastf1_session,
                drivers=settings.fastf1_drivers,
                cache_dir=settings.fastf1_cache_dir,
            )
            if laps:
                print(f"[data_source] FastF1 loaded {len(laps)} laps.")
                return laps
            print("[data_source] FastF1 returned no laps — falling back to mock.")
        except Exception as e:  # noqa: BLE001
            print(f"[data_source] FastF1 failed ({e!r}) — falling back to mock.")
    print("[data_source] Using synthetic circuit.")
    return build_session()
