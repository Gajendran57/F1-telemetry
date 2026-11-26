"""Runtime configuration loaded from environment (via python-dotenv)."""
from __future__ import annotations
import os
from dataclasses import dataclass, field, replace
from dotenv import load_dotenv

from f1_verifier.schemas import SessionSelection

load_dotenv()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes")


def _parse_lap_selection(raw: str) -> dict[str, list[int]]:
    # Format: "VER:32,NOR:34" or "VER:32|33,NOR:34"
    out: dict[str, list[int]] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue
        driver, laps_raw = part.split(":", 1)
        driver = driver.strip().upper()
        if not driver:
            continue
        laps: list[int] = []
        for token in laps_raw.replace("|", ";").split(";"):
            token = token.strip()
            if not token:
                continue
            try:
                laps.append(int(token))
            except ValueError:
                continue
        if laps:
            out[driver] = laps
    return out


@dataclass
class Settings:
    data_source: str
    fastf1_year: int
    fastf1_gp: str
    fastf1_session: str
    fastf1_drivers: list[str]
    fastf1_cache_dir: str
    fastf1_live_file: str | None
    fastf1_laps: dict[str, list[int]]
    allow_mock_fallback: bool
    cors_origins: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Settings":
        use_fastf1 = _env_bool("USE_FASTF1", False)
        origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        live_file = os.getenv("FASTF1_LIVE_FILE", "").strip() or None
        return cls(
            data_source="fastf1" if use_fastf1 else "mock",
            fastf1_year=int(os.getenv("FASTF1_YEAR", "2024")),
            fastf1_gp=os.getenv("FASTF1_GP", "Bahrain"),
            fastf1_session=os.getenv("FASTF1_SESSION", "Q"),
            fastf1_drivers=[
                d.strip().upper()
                for d in os.getenv("FASTF1_DRIVERS", "VER,NOR").split(",")
                if d.strip()
            ],
            fastf1_cache_dir=os.getenv("FASTF1_CACHE_DIR", ".fastf1_cache"),
            fastf1_live_file=live_file,
            fastf1_laps=_parse_lap_selection(os.getenv("FASTF1_LAPS", "")),
            allow_mock_fallback=_env_bool("ALLOW_MOCK_FALLBACK", True),
            cors_origins=[o.strip() for o in origins if o.strip()],
        )


settings = Settings.from_env()


def format_lap_selection(selection: dict[str, list[int]]) -> str:
    """Inverse of _parse_lap_selection, used to send .env defaults to the UI."""
    return ",".join(
        f"{driver}:{'|'.join(str(n) for n in laps)}"
        for driver, laps in selection.items()
    )


def _unique_upper(values: list[str]) -> list[str]:
    out: list[str] = []
    for value in values:
        cleaned = value.strip().upper()
        if cleaned and cleaned not in out:
            out.append(cleaned)
    return out


def resolve_settings(overrides: SessionSelection | None = None) -> Settings:
    """Layer optional API selectors on top of the values loaded from .env.

    The module-level `settings` object is read on every call so that callers
    (and tests) that patch it are honoured.
    """
    if overrides is None:
        return settings

    changes: dict[str, object] = {}
    if overrides.source is not None:
        changes["data_source"] = "fastf1" if overrides.source == "fastf1" else "mock"
    if overrides.year is not None:
        changes["fastf1_year"] = overrides.year
    if overrides.gp is not None and overrides.gp.strip():
        changes["fastf1_gp"] = overrides.gp.strip()
    if overrides.session is not None and overrides.session.strip():
        changes["fastf1_session"] = overrides.session.strip().upper()
    if overrides.drivers is not None:
        drivers = _unique_upper(overrides.drivers)
        if drivers:
            changes["fastf1_drivers"] = drivers
    if overrides.cacheDir is not None and overrides.cacheDir.strip():
        changes["fastf1_cache_dir"] = overrides.cacheDir.strip()
    if overrides.liveFile is not None:
        changes["fastf1_live_file"] = overrides.liveFile.strip() or None
    if overrides.laps is not None:
        changes["fastf1_laps"] = _parse_lap_selection(overrides.laps)
    if overrides.allowMockFallback is not None:
        changes["allow_mock_fallback"] = overrides.allowMockFallback

    return replace(settings, **changes)  # type: ignore[arg-type]
