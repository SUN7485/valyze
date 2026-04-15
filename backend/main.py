"""
Valyze Credit Backend — Main Application

How to run:
    pip install -r requirements.txt
    docker compose up -d gotenberg
    uvicorn main:app --reload --port 8000

The API will be available at http://localhost:8000
Health check: GET http://localhost:8000/health
API docs:     http://localhost:8000/docs
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database.db import init_db

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://localhost:3000")


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # -- Startup ----------------------------------------------------------------
    await init_db()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Path("outputs").mkdir(exist_ok=True)

    # Check Gotenberg availability
    try:
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{GOTENBERG_URL}/health", timeout=aiohttp.ClientTimeout(total=3)
            ) as r:
                if r.status == 200:
                    print(f"[OK] Gotenberg PDF service online at {GOTENBERG_URL}")
                else:
                    print(f"[!] Gotenberg returned status {r.status}")
    except Exception:
        print(f"[!] Gotenberg not reachable at {GOTENBERG_URL}")
        print("   Run: docker compose up -d gotenberg")

    print("\n" + "=" * 60)
    print("VALYZE CREDIT REPORT BACKEND READY")
    print("=" * 60)
    print("API:        http://localhost:8000")
    print("Docs:       http://localhost:8000/docs")
    print("Health:     http://localhost:8000/health")
    print("Gotenberg: ", GOTENBERG_URL)
    print("=" * 60)
    print()
    yield
    # -- Shutdown ---------------------------------------------------------------


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ValyzeCredit",
    description="Credit Report Generation System",
    version="1.0.0",
    lifespan=lifespan,
)

# -- CORS ---------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1573",
        "http://localhost:1574",
        "http://localhost:1575",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Static files -------------------------------------------------------------
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
Path("outputs").mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# -- Routers ------------------------------------------------------------------
# SIMPLIFIED: No AI extraction, no calculations
# Keep: upload (optional), report (edit + import), pdf (generate)

from api.upload import router as upload_router
from api.report import router as report_router
from api.pdf import router as pdf_router
from api.export import router as export_router
from api.search import router as search_router

app.include_router(upload_router)
app.include_router(report_router)
app.include_router(pdf_router)
app.include_router(export_router)
app.include_router(search_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "gotenberg": GOTENBERG_URL,
    }


@app.get("/api/pdf/service-status")
async def pdf_service_status():
    """Check Gotenberg PDF service status."""
    try:
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{GOTENBERG_URL}/health",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                if r.status == 200:
                    return {
                        "status": "online",
                        "service": "gotenberg",
                        "url": GOTENBERG_URL,
                    }
    except Exception as e:
        pass

    return {
        "status": "offline",
        "service": "gotenberg",
        "url": GOTENBERG_URL,
        "fix": "Run: docker compose up -d gotenberg",
    }
