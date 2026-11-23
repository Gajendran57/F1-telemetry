"""Runtime configuration loaded from environment (via python-dotenv)."""
from __future__ import annotations
import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Settings:
    data_source: str
    fastf1_year: int
    fastf1_gp: str
    fastf1_session: str
    fastf1_drivers: list[str]
    fastf1_cache_dir: str
    cors_origins: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Settings":
        use_fastf1 = os.getenv("USE_FASTF1", "false").strip().lower() in ("1", "true", "yes")
        origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        return cls(
            data_source="fastf1" if use_fastf1 else "mock",
            fastf1_year=int(os.getenv("FASTF1_YEAR", "2024")),
            fastf1_gp=os.getenv("FASTF1_GP", "Bahrain"),
            fastf1_session=os.getenv("FASTF1_SESSION", "Q"),
            fastf1_drivers=[d.strip().upper() for d in os.getenv("FASTF1_DRIVERS", "VER,NOR").split(",") if d.strip()],
            fastf1_cache_dir=os.getenv("FASTF1_CACHE_DIR", ".fastf1_cache"),
            cors_origins=[o.strip() for o in origins if o.strip()],
        )


settings = Settings.from_env()
