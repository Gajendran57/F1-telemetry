"""Pytest assertions mirrored by the in-browser Verifier tab."""
from __future__ import annotations
import math
import pytest

from f1_verifier.mock_source import build_session
from f1_verifier.analysis import (
    analyse_corners, compare_corners, compute_delta_t, derive_curvature, verify,
)


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
