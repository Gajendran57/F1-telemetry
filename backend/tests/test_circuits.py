"""The selected Grand Prix must produce its own circuit and matching GPS laps."""
from __future__ import annotations

import math

from f1_verifier.circuits import circuit_response, find_circuit, outline_from_laps
from f1_verifier.mock_source import build_session, build_track


def test_gp_names_resolve_to_distinct_real_circuits():
    monaco = find_circuit("Monaco")
    monza = find_circuit("Italian Grand Prix")
    assert monaco is not None and monza is not None
    assert monaco.id == "mc-1929"
    assert monza.id == "it-1922"
    assert monaco.name != monza.name


def test_track_geometry_changes_with_selection():
    monaco = build_track(10, gp="Monaco")
    monza = build_track(10, gp="Italian")
    assert len(monaco) > 50 and len(monza) > 50
    assert abs(sum(p.curvature for p in monaco) - sum(p.curvature for p in monza)) > 1e-3
    assert max(math.hypot(p.x - q.x, p.y - q.y) for p, q in zip(monaco, monza)) > 100


def test_mock_laps_follow_the_selected_circuit():
    circuit = find_circuit("Monaco")
    assert circuit is not None
    laps = build_session(drivers=["VER"], lap_selection={"VER": [44]}, gp="Monaco")
    sample = laps[0].samples[0]
    nearest = min(
        math.hypot(sample.x - x, sample.y - y) for x, y in circuit.points
    )
    # Racing lines are only a few metres wide; the GPS must sit on the layout.
    assert nearest < 12


def test_circuit_response_prefers_real_outline_in_mock_mode():
    laps = build_session(drivers=["VER"], gp="Bahrain")
    circuit = circuit_response("Bahrain", laps, "mock")
    assert circuit is not None
    assert circuit.source == "circuit-data"
    assert circuit.name == "Bahrain International Circuit"
    assert len(circuit.points) > 100


def test_circuit_can_be_estimated_from_telemetry():
    laps = build_session(drivers=["VER"], gp="Spa")
    circuit = outline_from_laps(laps)
    assert circuit is not None
    assert circuit.source == "telemetry"
    assert len(circuit.points) > 100


def test_laps_endpoint_exposes_the_circuit_to_the_map():
    from fastapi.testclient import TestClient

    from main import app

    response = TestClient(app).get("/api/v1/laps", params={
        "source": "mock", "gp": "Monaco", "drivers": "VER",
    })
    assert response.status_code == 200
    circuit = response.json()["circuit"]
    assert circuit["name"] == "Circuit de Monaco"
    assert circuit["source"] == "circuit-data"
    assert len(circuit["points"]) > 100
