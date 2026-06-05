"""
Vercel Serverless Entry Point — Valyze Credit Report Backend

This is the ONLY file Vercel should use as entry point.
It creates a minimal FastAPI app that proxies to Supabase.
"""

import os
import sys
import traceback

# Add backend directory to Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Create a clean FastAPI app (don't import main.py which triggers filesystem errors)
app = FastAPI(title="ValyzeCredit", version="1.0.0")

# ---------------------------------------------------------------------------
# CORS — allow all origins (safe because we use JWT tokens, not cookies)
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global error handler — return JSON for ANY unhandled exception so Vercel
# doesn't show a blank 500 page
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
    )


# Health check
@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/ready")
async def ready():
    try:
        from services.supabase_client import get_reports_count
        count = get_reports_count()
        return {"status": "ok", "supabase": "connected", "db_status": f"connected ({count} reports)"}
    except Exception as e:
        return {"status": "error", "supabase": "unavailable", "error": str(e)}, 503


# ---------------------------------------------------------------------------
# Register routers — each wrapped individually so one broken import
# doesn't crash the entire serverless function.
# ---------------------------------------------------------------------------

def _safe_include(name: str, module_path: str, attr: str = "router"):
    """Import a router and include it; log (but don't crash) on failure."""
    try:
        import importlib
        mod = importlib.import_module(module_path)
        rtr = getattr(mod, attr)
        app.include_router(rtr)
        print(f"[index] ✓ loaded router: {name}")
    except Exception as exc:
        print(f"[index] ✗ FAILED to load router '{name}' from {module_path}: {exc}")
        traceback.print_exc()


# Core routers (auth + proxy)
_safe_include("auth",       "api.auth")
_safe_include("proxy",      "api.proxy")

# Feature routers (may have heavier deps — load gracefully)
_safe_include("upload",     "api.upload")
_safe_include("report",     "api.report")
_safe_include("pdf",        "api.pdf")
_safe_include("export",     "api.export")
_safe_include("search",     "api.search")
_safe_include("cloud",      "api.cloud")

print(f"[index] routers loaded — app ready")