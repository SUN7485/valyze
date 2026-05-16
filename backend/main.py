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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

from database.db import init_db
from database.exceptions import DuplicateReportError
from services.auth import require_valid_config

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

# Validate environment variables at startup
require_valid_config()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://localhost:3000")

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # -- Startup --------------------------------------------------------------
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

# Add rate limiter to app
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)


# ---------------------------------------------------------------------------
# Security Middleware - Security Headers
# ---------------------------------------------------------------------------

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    
    # Prevent clickjacking
    response.headers["X-Frame-Options"] = "DENY"
    
    # XSS protection
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    # HSTS (force HTTPS in production)
    if os.getenv("ENVIRONMENT") == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Content Security Policy (restrictive but functional)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self' https://*.supabase.co;"
    )
    
    # Referrer policy
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # Permissions policy
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    
    return response


# ---------------------------------------------------------------------------
# Exception Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(DuplicateReportError)
async def duplicate_report_handler(request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc)})

# -- CORS ---------------------------------------------------------------------
# Restricted CORS - only allow specific origins in production
allowed_origins = [
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

# Add production domains from environment variable
if os.getenv("ALLOWED_ORIGINS"):
    allowed_origins.extend([origin.strip() for origin in os.getenv("ALLOWED_ORIGINS").split(",")])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
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
from api.cloud import router as cloud_router
from api.auth import router as auth_router

app.include_router(auth_router)
app.include_router(upload_router)
app.include_router(report_router)
app.include_router(pdf_router)
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


