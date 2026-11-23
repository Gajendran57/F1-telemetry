"""FastAPI entry point — run with:  python main.py  (or: uvicorn main:app --reload)."""
from __future__ import annotations
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from f1_verifier.config import settings
from f1_verifier.data_source import load_laps
from f1_verifier.analysis import analyse_pair
from f1_verifier.schemas import AnalysisResponse, LapTelemetry, VerifierReport

app = FastAPI(title="F1 Telemetry Verifier", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "source": settings.data_source}


@app.get("/api/v1/laps", response_model=list[LapTelemetry])
def get_laps() -> list[LapTelemetry]:
    return load_laps()


def _find_lap(laps: list[LapTelemetry], key: str | None) -> LapTelemetry | None:
    if key is None:
        return None
    for lap in laps:
        if f"{lap.driver}-{lap.lapNumber}" == key:
            return lap
    return None


@app.get("/api/v1/analysis", response_model=AnalysisResponse)
def get_analysis(ref: str | None = None, cmp: str | None = None) -> AnalysisResponse:
    laps = load_laps()
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
    )


@app.get("/api/v1/verify", response_model=VerifierReport)
def get_verify(ref: str | None = None, cmp: str | None = None) -> VerifierReport:
    return get_analysis(ref, cmp).verifier


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
