"""UI session overrides must layer on top of .env without leaking between calls."""
from __future__ import annotations

from f1_verifier.config import resolve_settings
from f1_verifier.data_source import clear_cache, load_laps
from f1_verifier.schemas import SessionSelection


def test_overrides_layer_onto_env_defaults():
    effective = resolve_settings(SessionSelection(
        source="fastf1", year=2023, gp="Monaco", session="q",
        drivers=["nor", "VER", "NOR"], laps="VER:32|33",
        cacheDir="/tmp/f1-cache", liveFile="", allowMockFallback=False,
    ))
    assert effective.data_source == "fastf1"
    assert effective.fastf1_year == 2023
    assert effective.fastf1_gp == "Monaco"
    assert effective.fastf1_session == "Q"
    assert effective.fastf1_drivers == ["NOR", "VER"]
    assert effective.fastf1_laps == {"VER": [32, 33]}
    assert effective.fastf1_cache_dir == "/tmp/f1-cache"
    assert effective.fastf1_live_file is None
    assert effective.allow_mock_fallback is False


def test_mock_mode_honours_driver_and_lap_selection():
    clear_cache()
    try:
        laps, source = load_laps(overrides=SessionSelection(
            source="mock", drivers=["LEC"], laps="LEC:44",
        ))
        assert source == "mock"
        assert [(lap.driver, lap.lapNumber) for lap in laps] == [("LEC", 44)]
    finally:
        clear_cache()


def test_cache_is_separate_for_each_selection():
    clear_cache()
    try:
        first, _ = load_laps(overrides=SessionSelection(source="mock", drivers=["VER"]))
        second, _ = load_laps(overrides=SessionSelection(source="mock", drivers=["HAM"]))
        assert {lap.driver for lap in first} == {"VER"}
        assert {lap.driver for lap in second} == {"HAM"}
    finally:
        clear_cache()
