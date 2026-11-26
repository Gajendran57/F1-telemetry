"""Pytest assertions mirrored by the in-browser Verifier tab."""
from __future__ import annotations
import math
import pytest

from f1_verifier.mock_source import build_session
from f1_verifier.analysis import (
    analyse_corners, compare_corners, compute_delta_t, derive_curvature, verify,
)
from f1_verifier.data_source import clear_cache, load_laps
from f1_verifier import data_source as ds
from f1_verifier import config as cfg


@pytest.fixture(scope="module")
def session():
    return build_session()


def test_session_has_four_laps(session):
    assert len(session) == 4


def test_distance_monotonic(session):
    for lap in session:
        d = [s.distance for s in lap.samples]
        assert all(d[i] <= d[i + 1] for i in range(len(d) - 1))


def test_time_monotonic(session):
    for lap in session:
        t = [s.time for s in lap.samples]
        assert all(t[i] <= t[i + 1] for i in range(len(t) - 1))


def test_speed_bounds(session):
    for lap in session:
        for s in lap.samples:
            assert 0 <= s.speed <= 400


def test_laptime_matches_final_time(session):
    for lap in session:
        assert abs(lap.samples[-1].time - lap.lapTime) < 0.01


def test_curvature_is_finite(session):
    for lap in session:
        curv = derive_curvature(lap.samples)
        assert all(math.isfinite(c) for c in curv)


def test_detect_at_least_one_corner(session):
    curv = derive_curvature(session[0].samples)
    corners = analyse_corners(session[0], curv)
    assert len(corners) > 0


def test_delta_t_starts_at_zero(session):
    dt = compute_delta_t(session[0], session[2])
    assert dt
    assert abs(dt[0].delta) < 0.05


def test_apex_is_speed_minimum(session):
    curv = derive_curvature(session[0].samples)
    corners = analyse_corners(session[0], curv)
    for c in corners:
        assert c.minSpeed <= c.entrySpeed + 1e-6
        assert c.minSpeed <= c.exitSpeed + 1e-6


def test_braking_point_before_apex(session):
    curv = derive_curvature(session[0].samples)
    corners = analyse_corners(session[0], curv)
    for c in corners:
        assert c.brakePoint is None or c.brakePoint <= c.apexDistance


def test_verifier_passes(session):
    ref = session[0]
    cmp = session[2]
    ref_corners = analyse_corners(ref, derive_curvature(ref.samples))
    cmp_corners = analyse_corners(cmp, derive_curvature(cmp.samples))
    dt = compute_delta_t(ref, cmp)
    report = verify(session, ref_corners, cmp_corners, dt)
    assert report.failed == 0, [i.model_dump() for i in report.issues if i.status == "fail"]


def test_compare_corners_returns_entry_per_corner(session):
    ref = session[0]
    cmp = session[2]
    ref_corners = analyse_corners(ref, derive_curvature(ref.samples))
    cmp_corners = analyse_corners(cmp, derive_curvature(cmp.samples))
    deltas = compare_corners(ref_corners, cmp_corners)
    assert len(deltas) == len(ref_corners)
    for d in deltas:
        assert d.corner > 0


def test_load_laps_returns_source_and_caches(session, monkeypatch):
    clear_cache()
    monkeypatch.setattr(cfg.settings, "data_source", "fastf1")
    monkeypatch.setattr(cfg.settings, "allow_mock_fallback", False)

    calls = {"n": 0}

    def fake_load_from_fastf1(**kwargs):
        calls["n"] += 1
        return session[:2], "fastf1"

    monkeypatch.setattr("f1_verifier.fastf1_source.load_from_fastf1", fake_load_from_fastf1)
    laps1, src1 = load_laps(force=True)
    laps2, src2 = load_laps(force=False)
    assert src1 == "fastf1"
    assert src2 == "fastf1"
    assert len(laps1) == 2
    assert calls["n"] == 1


def test_load_laps_no_mock_fallback_raises(monkeypatch):
    clear_cache()
    monkeypatch.setattr(cfg.settings, "data_source", "fastf1")
    monkeypatch.setattr(cfg.settings, "allow_mock_fallback", False)

    def boom(**kwargs):
        raise RuntimeError("not ready")

    monkeypatch.setattr("f1_verifier.fastf1_source.load_from_fastf1", boom)
    with pytest.raises(RuntimeError):
        load_laps(force=True)
    clear_cache()
