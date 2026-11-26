# Shared static data

## `circuits.json`

Circuit centre-line outlines used when the app runs in mock/synthetic mode, so
that a selected Grand Prix produces the **actual circuit shape** and the GPS
trajectory lines up with the circuit drawn on the map.

Source: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT
licence). The upstream GeoJSON was converted from latitude/longitude to local
east/north metres centred on each circuit; no other geometry was invented.

The file is consumed by:

- `backend/f1_verifier/circuits.py` (FastAPI / mock generator)
- `frontend/src/data/circuits.json` (offline frontend fallback — kept in sync
  with this file)
