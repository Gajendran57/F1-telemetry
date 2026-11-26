"""Values offered by the UI selectors.

Static lists are used as an offline fallback; when FastF1 is installed and the
schedule can be reached, the event list is loaded from FastF1 and cached.
"""
from __future__ import annotations

import importlib.util
import time
from datetime import datetime

from f1_verifier.schemas import OptionItem

SESSIONS: list[OptionItem] = [
    OptionItem(value="FP1", label="Practice 1"),
    OptionItem(value="FP2", label="Practice 2"),
    OptionItem(value="FP3", label="Practice 3"),
    OptionItem(value="Q", label="Qualifying"),
    OptionItem(value="S", label="Sprint"),
    OptionItem(value="S1", label="Sprint Qualifying 1"),
    OptionItem(value="S2", label="Sprint Qualifying 2"),
    OptionItem(value="S3", label="Sprint Qualifying 3"),
    OptionItem(value="R", label="Race"),
]

DRIVERS: list[OptionItem] = [
    OptionItem(value="VER", label="Max Verstappen"),
    OptionItem(value="NOR", label="Lando Norris"),
    OptionItem(value="PIA", label="Oscar Piastri"),
    OptionItem(value="LEC", label="Charles Leclerc"),
    OptionItem(value="HAM", label="Lewis Hamilton"),
    OptionItem(value="RUS", label="George Russell"),
    OptionItem(value="SAI", label="Carlos Sainz"),
    OptionItem(value="ALO", label="Fernando Alonso"),
    OptionItem(value="PER", label="Sergio Perez"),
    OptionItem(value="GAS", label="Pierre Gasly"),
    OptionItem(value="STR", label="Lance Stroll"),
    OptionItem(value="RIC", label="Daniel Ricciardo"),
    OptionItem(value="BOT", label="Valtteri Bottas"),
    OptionItem(value="OCO", label="Esteban Ocon"),
    OptionItem(value="MAG", label="Kevin Magnussen"),
    OptionItem(value="HUL", label="Nico Hulkenberg"),
    OptionItem(value="TSU", label="Yuki Tsunoda"),
    OptionItem(value="ALB", label="Alexander Albon"),
    OptionItem(value="ZHO", label="Guanyu Zhou"),
    OptionItem(value="LAR", label="Liam Lawson"),
    OptionItem(value="VET", label="Sebastian Vettel"),
    OptionItem(value="KVY", label="Daniil Kvyat"),
    OptionItem(value="GIO", label="Antonio Giovinazzi"),
    OptionItem(value="RAI", label="Kimi Raikkonen"),
]

FALLBACK_EVENTS: list[OptionItem] = [
    OptionItem(value="Bahrain", label="Bahrain Grand Prix", detail="Bahrain"),
    OptionItem(value="Saudi Arabian", label="Saudi Arabian Grand Prix", detail="Saudi Arabia"),
    OptionItem(value="Australian", label="Australian Grand Prix", detail="Australia"),
    OptionItem(value="Chinese", label="Chinese Grand Prix", detail="China"),
    OptionItem(value="Miami", label="Miami Grand Prix", detail="United States"),
    OptionItem(value="Emilia Romagna", label="Emilia Romagna Grand Prix", detail="Italy"),
    OptionItem(value="Monaco", label="Monaco Grand Prix", detail="Monaco"),
    OptionItem(value="Spanish", label="Spanish Grand Prix", detail="Spain"),
    OptionItem(value="Canadian", label="Canadian Grand Prix", detail="Canada"),
    OptionItem(value="Austrian", label="Austrian Grand Prix", detail="Austria"),
    OptionItem(value="British", label="British Grand Prix", detail="United Kingdom"),
    OptionItem(value="Hungarian", label="Hungarian Grand Prix", detail="Hungary"),
    OptionItem(value="Belgian", label="Belgian Grand Prix", detail="Belgium"),
    OptionItem(value="Dutch", label="Dutch Grand Prix", detail="Netherlands"),
    OptionItem(value="Italian", label="Italian Grand Prix", detail="Italy"),
    OptionItem(value="Singapore", label="Singapore Grand Prix", detail="Singapore"),
    OptionItem(value="United States", label="United States Grand Prix", detail="United States"),
    OptionItem(value="Mexico", label="Mexico City Grand Prix", detail="Mexico"),
    OptionItem(value="Brazilian", label="Sao Paulo Grand Prix", detail="Brazil"),
    OptionItem(value="Las Vegas", label="Las Vegas Grand Prix", detail="United States"),
    OptionItem(value="Qatar", label="Qatar Grand Prix", detail="Qatar"),
    OptionItem(value="Abu Dhabi", label="Abu Dhabi Grand Prix", detail="United Arab Emirates"),
]

_SCHEDULE_TTL = 6 * 60 * 60  # seconds
_schedule_cache: dict[int, tuple[float, list[OptionItem]]] = {}


def fastf1_available() -> bool:
    try:
        return importlib.util.find_spec("fastf1") is not None
    except (ImportError, ValueError):
        return False


def supported_years() -> list[int]:
    current = datetime.now().year
    return list(range(2018, current + 1))


def events_for_year(year: int) -> list[OptionItem]:
    cached = _schedule_cache.get(year)
    if cached and time.time() - cached[0] < _SCHEDULE_TTL:
        return cached[1]

    events: list[OptionItem] = []
    if fastf1_available():
        try:
            import fastf1  # lazy: the mock path must not need FastF1

            schedule = fastf1.get_event_schedule(year, include_testing=False)
            for _, row in schedule.iterrows():
                name = str(row["EventName"]).strip()
                if not name or name.lower() == "test":
                    continue
                official = str(row.get("OfficialEventName", "") or "").strip()
                events.append(
                    OptionItem(
                        value=name,
                        label=official or name.replace(" Grand Prix", "") + " Grand Prix",
                        detail=str(row.get("Country", "") or "") or None,
                    )
                )
        except Exception as e:  # noqa: BLE001 — offline / upstream failure
            print(f"[options] schedule for {year} unavailable ({e!r}); using fallback list.")

    if not events:
        events = [item.model_copy() for item in FALLBACK_EVENTS]

    _schedule_cache[year] = (time.time(), events)
    return events
