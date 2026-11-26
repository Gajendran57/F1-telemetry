# F1 Telemetry Verifier — Backend

FastAPI service that exposes the FastF1-driven analysis pipeline.

## Quick start (mock data — no network needed)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py                # http://localhost:8000
```

## Runtime session selection

`.env` values are the defaults. The frontend can override them per request on
`/api/v1/laps`, `/api/v1/analysis` and `/api/v1/verify` using these query params:

| Param | Maps to `.env` | Example |
| --- | --- | --- |
| `source` | `USE_FASTF1` | `mock` or `fastf1` |
| `year` | `FASTF1_YEAR` | `2024` |
| `gp` | `FASTF1_GP` | `Bahrain` |
| `session` | `FASTF1_SESSION` | `R`, `Q`, `FP1`, `S`, … |
| `drivers` | `FASTF1_DRIVERS` | repeat `drivers=VER&drivers=NOR` or comma-separate |
| `laps` | `FASTF1_LAPS` | `VER:32,NOR:34\|35` (blank clears) |
| `cacheDir` | `FASTF1_CACHE_DIR` | `.fastf1_cache` |
| `liveFile` | `FASTF1_LIVE_FILE` | path to a livetiming recording |
| `allowMockFallback` | `ALLOW_MOCK_FALLBACK` | `true` / `false` |

`GET /api/v1/options?year=2024` returns the selectable seasons, events,
sessions, drivers, the current `.env` defaults, and CORS origins (read-only).
Each distinct selection has its own 60-second cache, so changing the UI never
returns another session's laps. Restart the backend after editing `.env`.

`GET /api/v1/laps` also returns a `circuit` object: the centre-line of the
selected circuit in local east/north metres. Mock sessions use the real layout
from `shared/circuits.json`; FastF1/live sessions use the GPS of a loaded lap
when available. The frontend draws this outline behind the GPS trajectories so
the two always share the same frame of reference.

