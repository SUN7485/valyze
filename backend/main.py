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
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from database.db import init_db
from database.exceptions import DuplicateReportError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
IS_VERCEL = os.getenv("VERCEL") is not None


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # -- Startup --------------------------------------------------------------
    await init_db()

    # Only create directories in non-serverless environments
    if not IS_VERCEL:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        Path("outputs").mkdir(exist_ok=True)

    yield
    # -- Shutdown ------------------------------------------------------------- 


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ValyzeCredit",
    description="Credit Report Generation System",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Exception Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(DuplicateReportError)
async def duplicate_report_handler(request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc)})

# -- CORS ---------------------------------------------------------------------
# Build allowed origins from environment + localhost defaults
CORS_ORIGINS = [
    # Local development
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
    "http://localhost:3000",
    "http://localhost:3001",
]

# Add production frontend URL from environment variable
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
if FRONTEND_URL:
    CORS_ORIGINS.append(FRONTEND_URL)

# Also allow any Vercel preview deployments (*.vercel.app)
ALLOWED_EXTRA_ORIGINS = os.getenv("CORS_EXTRA_ORIGINS", "")
if ALLOWED_EXTRA_ORIGINS:
    for origin in ALLOWED_EXTRA_ORIGINS.split(","):
        origin = origin.strip()
        if origin:
            CORS_ORIGINS.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Static files (skip in Vercel serverless - no persistent filesystem) -----

if not IS_VERCEL:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Path("outputs").mkdir(exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
    app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# -- Routers ------------------------------------------------------------------
# SIMPLIFIED: No AI extraction, no calculations
# Keep: upload (optional), report (edit + import), pdf (generate)

from api.auth import router as auth_router
from api.upload import router as upload_router
from api.report import router as report_router
from api.pdf import router as pdf_router
from api.export import router as export_router
from api.search import router as search_router
from api.cloud import router as cloud_router
from api.proxy import router as proxy_router

app.include_router(auth_router)
app.include_router(upload_router)
app.include_router(report_router)
app.include_router(pdf_router)
app.include_router(export_router)
app.include_router(search_router)
app.include_router(cloud_router)
app.include_router(proxy_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "pdf": "client-side",
    }


@app.get("/ready")
async def readiness_check():
    """Readiness probe - checks Supabase connectivity."""
    try:
        from services.supabase_client import get_reports_count

        count = get_reports_count()
        return {
            "status": "ok",
            "supabase": "connected",
            "db_status": f"connected ({count} reports)",
        }
    except Exception as e:
        return JSONResponse(
            content={"status": "error", "supabase": "unavailable", "error": str(e)},
            status_code=503,
        )




