"""
Valyze Credit Backend — local / container entry point.

How to run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

This serves the SAME hardened app as the Vercel entry (`api/index.py`): every
router is registered there with its auth dependencies. Don't register routers
or mount static directories here — anything added only to this file would ship
unauthenticated on the Docker/Render deploy.

The API will be available at http://localhost:8000
Health check: GET http://localhost:8000/health
API docs:     http://localhost:8000/docs
"""

from __future__ import annotations

from dotenv import load_dotenv

# Load backend/.env before api.index reads its configuration at import time.
load_dotenv()

from api.index import app  # noqa: E402,F401
