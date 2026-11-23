# F1 Telemetry Verifier — Backend

FastAPI service that exposes the FastF1-driven analysis pipeline.

## Quick start (mock data — no network needed)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py                # http://localhost:8000
