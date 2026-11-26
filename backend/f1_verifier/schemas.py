"""Pydantic schemas — must stay in sync with frontend/src/types/telemetry.ts."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

Compound = Literal["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]

#: Runtime overrides for the values normally supplied by backend/.env.
#: Every field is optional — omitted fields keep their .env value.
class SessionSelection(BaseModel):
    source: Literal["mock", "fastf1"] | None = None
    year: int | None = Field(default=None, ge=2015, le=2100)
    gp: str | None = Field(default=None, max_length=120)
    session: str | None = Field(default=None, max_length=8)
    drivers: list[str] | None = None
    cacheDir: str | None = Field(default=None, max_length=300)
    liveFile: str | None = Field(default=None, max_length=500)
    laps: str | None = Field(default=None, max_length=500)
    allowMockFallback: bool | None = None


class OptionItem(BaseModel):
    value: str
    label: str
    detail: str | None = None


class OptionsResponse(BaseModel):
    year: int
    years: list[int]
    events: list[OptionItem]
    sessions: list[OptionItem]
    drivers: list[OptionItem]
    defaults: SessionSelection
    fastf1Available: bool
    corsOrigins: list[str]


class TelemetrySample(BaseModel):
    distance: float
    time: float
    speed: float
    throttle: float
    brake: bool
    gear: int
    rpm: int
    drs: int
    x: float
    y: float


class LapTelemetry(BaseModel):
    driver: str
    lapNumber: int
    lapTime: float
    compound: Compound
    samples: list[TelemetrySample]


class DeltaTPoint(BaseModel):
    distance: float
    delta: float


class CornerAnalysis(BaseModel):
    corner: int
    startDistance: float
    apexDistance: float
    endDistance: float
    minSpeed: float
    entrySpeed: float
    exitSpeed: float
    gearAtApex: int
    brakePoint: float | None = None
    brakeRelease: float | None = None
    brakeDuration: float | None = None
    apexX: float
    apexY: float


class CornerDelta(BaseModel):
    corner: int
    refMinSpeed: float
    cmpMinSpeed: float
    minSpeedDelta: float
    apexDistanceDelta: float


class ValidationIssue(BaseModel):
    id: str
    check: str
    status: Literal["pass", "warn", "fail"]
    detail: str


class VerifierReport(BaseModel):
    generatedAt: str
    totalChecks: int
    passed: int
    warned: int
    failed: int
    issues: list[ValidationIssue]


DataSource = Literal["fastf1", "live", "mock"]


class CircuitOutline(BaseModel):
    """Circuit centre-line in local east/north metres, drawn behind the laps."""
    id: str | None = None
    name: str
    country: str | None = None
    length: float
    points: list[tuple[float, float]]
    source: Literal["circuit-data", "telemetry"] = "circuit-data"


class LapsResponse(BaseModel):
    laps: list[LapTelemetry]
    source: DataSource
    circuit: CircuitOutline | None = None


class AnalysisResponse(BaseModel):
    reference: LapTelemetry
    comparison: LapTelemetry
    deltaT: list[DeltaTPoint]
    corners: list[CornerAnalysis]
    comparisonCorners: list[CornerAnalysis]
    cornerDeltas: list[CornerDelta]
    verifier: VerifierReport
    source: DataSource
