"""FastAPI entry point — run with:  python main.py  (or: uvicorn main:app --reload)."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from f1_verifier.analysis import analyse_pair
from f1_verifier.circuits import circuit_response
from f1_verifier.config import format_lap_selection, resolve_settings, settings
from f1_verifier.data_source import load_laps
from f1_verifier.options import (
    DRIVERS,
    SESSIONS,
    events_for_year,
    fastf1_available,
    supported_years,
)
from f1_verifier.schemas import (
    AnalysisResponse,
    LapTelemetry,
    LapsResponse,
    OptionItem,
    OptionsResponse,
    SessionSelection,
    VerifierReport,
)

app = FastAPI(title="F1 Telemetry Verifier", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def session_selection(
    source: str | None = Query(None, pattern="^(mock|fastf1)$"),
    year: int | None = Query(None, ge=2015, le=2100),
    gp: str | None = Query(None, max_length=120),
    session: str | None = Query(None, max_length=8),
    drivers: list[str] | None = Query(None, description="Repeatable or comma-separated"),
    cache_dir: str | None = Query(None, alias="cacheDir", max_length=300),
    live_file: str | None = Query(None, alias="liveFile", max_length=500),
    laps: str | None = Query(None, description="e.g. VER:32,NOR:34 (blank clears)"),
    allow_mock_fallback: bool | None = Query(None, alias="allowMockFallback"),
) -> SessionSelection:
    """Parse UI overrides from the query string; omitted values use backend/.env."""
    flat_drivers = [
        code.strip().upper()
        for entry in (drivers or [])
        for code in entry.split(",")
        if code.strip()
    ]
    return SessionSelection(
        source=source,
        year=year,
        gp=gp,
        session=session,
        drivers=flat_drivers or None,
        cacheDir=cache_dir,
        liveFile=live_file,
        laps=laps,
        allowMockFallback=allow_mock_fallback,
    )


Selection = Annotated[SessionSelection, Depends(session_selection)]


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "source": settings.data_source, "fastf1": fastf1_available()}


@app.get("/api/v1/options", response_model=OptionsResponse)
def get_options(year: int | None = Query(None, ge=2015, le=2100)) -> OptionsResponse:
    """Selectable values, with the current backend/.env values as defaults."""
    selected_year = year or settings.fastf1_year
    events = events_for_year(selected_year)
    if selected_year == settings.fastf1_year and not any(
        e.value.lower() == settings.fastf1_gp.lower() for e in events
    ):
        events = [
            OptionItem(value=settings.fastf1_gp, label=f"{settings.fastf1_gp} (from .env)"),
            *events,
        ]

    driver_options = list(DRIVERS)
    for code in settings.fastf1_drivers:
        if not any(d.value.lower() == code.lower() for d in driver_options):
            driver_options.insert(0, OptionItem(value=code, label=f"{code} (from .env)"))

    return OptionsResponse(
        year=selected_year,
        years=supported_years(),
        events=events,
        sessions=list(SESSIONS),
        drivers=driver_options,
        defaults=SessionSelection(
            source="fastf1" if settings.data_source == "fastf1" else "mock",
            year=settings.fastf1_year,
            gp=settings.fastf1_gp,
            session=settings.fastf1_session,
            drivers=list(settings.fastf1_drivers),
            cacheDir=settings.fastf1_cache_dir,
            liveFile=settings.fastf1_live_file,
            laps=format_lap_selection(settings.fastf1_laps) or None,
            allowMockFallback=settings.allow_mock_fallback,
        ),
        fastf1Available=fastf1_available(),
        corsOrigins=settings.cors_origins,
    )


@app.get("/api/v1/laps", response_model=LapsResponse)
def get_laps(
    selection: Selection,
    force: bool = Query(False, description="Bypass cache and reload"),
) -> LapsResponse:
    try:
        laps, source = load_laps(force=force, overrides=selection)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"Telemetry not ready: {e}") from e
    effective = resolve_settings(selection)
    return LapsResponse(
        laps=laps,
        source=source,
        circuit=circuit_response(effective.fastf1_gp, laps, source),
    )


def _find_lap(laps: list[LapTelemetry], key: str | None) -> LapTelemetry | None:
    if key is None:
        return None
    for lap in laps:
        if f"{lap.driver}-{lap.lapNumber}" == key:
            return lap
    return None


@app.get("/api/v1/analysis", response_model=AnalysisResponse)
def get_analysis(
    selection: Selection,
    ref: str | None = None,
    cmp: str | None = None,
    force: bool = Query(False, description="Bypass cache and reload"),
) -> AnalysisResponse:
    try:
        laps, source = load_laps(force=force, overrides=selection)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"Telemetry not ready: {e}") from e
    if len(laps) < 2:
        raise HTTPException(400, "Need at least 2 laps to compare")

    ref_lap = _find_lap(laps, ref) or laps[0]
    cmp_lap = _find_lap(laps, cmp) or laps[min(2, len(laps) - 1)]
    if cmp_lap is ref_lap:
        cmp_lap = next((l for l in laps if l is not ref_lap), laps[1])

    ref_corners, cmp_corners, delta_t, corner_deltas, report = analyse_pair(
        ref_lap, cmp_lap, laps
    )
    return AnalysisResponse(
        reference=ref_lap,
        comparison=cmp_lap,
        deltaT=delta_t,
        corners=ref_corners,
        comparisonCorners=cmp_corners,
        cornerDeltas=corner_deltas,
        verifier=report,
        source=source,
    )


@app.get("/api/v1/verify", response_model=VerifierReport)
def get_verify(
    selection: Selection,
    ref: str | None = None,
    cmp: str | None = None,
    force: bool = Query(False, description="Bypass cache and reload"),
) -> VerifierReport:
    return get_analysis(ref=ref, cmp=cmp, force=force, selection=selection).verifier


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
