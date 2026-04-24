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
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from database.db import init_db

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://localhost:3000")
ENV = os.getenv("ENV", "development")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

import logging

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

IS_PRODUCTION = ENV == "production"


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # -- Startup ----------------------------------------------------------
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
    print(f"ENV:        {ENV}")
    print(f"LOG_LEVEL:  {LOG_LEVEL}")
    print("API:        http://localhost:8000")
    print("Docs:       http://localhost:8000/docs")
    print("Health:     http://localhost:8000/health")
    print("Gotenberg: ", GOTENBERG_URL)
    print("=" * 60)
    print()
    yield
    # -- Shutdown ---------------------------------------------------------


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ValyzeCredit",
    description="Credit Report Generation System",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate Limiting Middleware (simple in-memory)
# ---------------------------------------------------------------------------

import time
from collections import defaultdict, deque
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter: 100 req/min per IP, excludes health/auth."""

    def __init__(self, app, max_requests=100, window=60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window
        self.requests = defaultdict(deque)

    async def dispatch(self, request, call_next):
        path = request.url.path
        if path in [
            "/health",
            "/ready",
            "/api/auth/signup",
            "/api/auth/login",
            "/api/auth/verify",
        ]:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - self.window

        timestamps = self.requests[client_ip]
        while timestamps and timestamps[0] < window_start:
            timestamps.popleft()

        if len(timestamps) >= self.max_requests:
            response = JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
            )
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, Authorization"
            )
            return response

        timestamps.append(now)
        response = await call_next(request)
        return response


app.add_middleware(SimpleRateLimitMiddleware, max_requests=100, window=60)

# ---------------------------------------------------------------------------
# CORS - Allow ALL origins for maximum compatibility
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Security Headers Middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    if os.getenv("ENV") == "production":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


# ---------------------------------------------------------------------------
# Global Exception Handler
# ---------------------------------------------------------------------------
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    import traceback

    print(f"[ERROR] Validation error on {request.method} {request.url.path}")
    traceback.print_exc()
    response = JSONResponse(
        status_code=422,
        content={"detail": "Validation Error", "errors": exc.errors()},
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    """Catch unhandled exceptions and return sanitized error response."""
    import traceback

    if isinstance(exc, StarletteHTTPException):
        response = JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    else:
        print(f"[ERROR] Unhandled exception on {request.method} {request.url.path}")
        traceback.print_exc()
        response = JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {type(exc).__name__}"},
        )

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    )
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
Path("outputs").mkdir(exist_ok=True)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
# SIMPLIFIED: No AI extraction, no calculations
# Keep: upload (optional), report (edit + import), pdf (generate)

from api.upload import router as upload_router
from api.report import router as report_router
from api.pdf import router_auth as pdf_router, router_public as pdf_public_router
from api.export import router as export_router
from api.search import router as search_router
from api.cloud import router as cloud_router
from api.auth import router as auth_router

app.include_router(auth_router)  # auth endpoints (public)
app.include_router(upload_router)
app.include_router(report_router)
app.include_router(pdf_router)
app.include_router(pdf_public_router)
app.include_router(export_router)
app.include_router(search_router)
app.include_router(cloud_router)


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
        return {
            "status": "error",
            "supabase": "unavailable",
            "error": str(e),
        }, 503


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
