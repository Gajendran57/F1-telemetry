"""Pydantic schemas — must stay in sync with frontend/src/types/telemetry.ts."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel

Compound = Literal["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]


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


class AnalysisResponse(BaseModel):
    reference: LapTelemetry
    comparison: LapTelemetry
    deltaT: list[DeltaTPoint]
    corners: list[CornerAnalysis]
    comparisonCorners: list[CornerAnalysis]
    cornerDeltas: list[CornerDelta]
    verifier: VerifierReport
