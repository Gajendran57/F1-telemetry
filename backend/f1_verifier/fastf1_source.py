"""Loads real telemetry via FastF1 (used when USE_FASTF1=true)."""
from __future__ import annotations
import math
from f1_verifier.schemas import Compound, LapTelemetry, TelemetrySample

_VALID_COMPOUNDS = {"SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"}


def load_from_fastf1(
    *,
    year: int,
    gp: str,
    session: str,
    drivers: list[str],
    cache_dir: str,
) -> list[LapTelemetry]:
    import fastf1  # lazy import so the mock path has zero heavy deps

    fastf1.Cache.enable_cache(cache_dir)
    sess = fastf1.get_session(year, gp, session)
    sess.load(telemetry=True, laps=True, weather=False, messages=False)

    out: list[LapTelemetry] = []
    for drv in drivers:
        driver_laps = sess.laps.pick_driver(drv)
        if driver_laps.empty:
            continue
        for _, lap in driver_laps.head(2).iterrows():
            if lap.get("IsAccurate") is False:
                continue
            try:
                tel = lap.get_telemetry()
            except Exception as e:
                print(f"  skip {drv} L{lap.get('LapNumber')}: {e}")
                continue
            if tel is None or tel.empty:
                continue
            samples = _df_to_samples(tel)
            if len(samples) < 10:
                continue
            lap_time = lap.get("LapTime")
            if lap_time is None or (
                hasattr(lap_time, "total_seconds") and math.isnan(lap_time.total_seconds())
            ):
                continue
            compound = str(lap.get("Compound") or "SOFT").upper()
            if compound not in _VALID_COMPOUNDS:
                compound = "SOFT"
            out.append(LapTelemetry(
                driver=drv,
                lapNumber=int(lap.get("LapNumber", 0)),
                lapTime=float(
                    lap_time.total_seconds() if hasattr(lap_time, "total_seconds") else lap_time
                ),
                compound=compound,  # type: ignore[arg-type]
                samples=samples,
            ))
    return out


def _df_to_samples(df) -> list[TelemetrySample]:
    t0 = df["Time"].iloc[0]
    d0 = float(df["Distance"].iloc[0])
    has_xy = "X" in df.columns and "Y" in df.columns

    samples: list[TelemetrySample] = []
    for _, row in df.iterrows():
        try:
            samples.append(TelemetrySample(
                distance=float(row["Distance"]) - d0,
                time=float((row["Time"] - t0).total_seconds()),
                speed=float(row["Speed"]),
                throttle=float(row["Throttle"]) if not _is_nan(row["Throttle"]) else 0.0,
                brake=bool(row["Brake"]),
                gear=int(row["nGear"]) if not _is_nan(row["nGear"]) else 0,
                rpm=int(row["RPM"]) if not _is_nan(row["RPM"]) else 0,
                drs=int(row["DRS"]) if "DRS" in df.columns and not _is_nan(row["DRS"]) else 0,
                x=float(row["X"]) if has_xy and not _is_nan(row["X"]) else 0.0,
                y=float(row["Y"]) if has_xy and not _is_nan(row["Y"]) else 0.0,
            ))
        except Exception:
            continue
    return samples


def _is_nan(v) -> bool:
    try:
        return math.isnan(float(v))
    except (TypeError, ValueError):
        return True
