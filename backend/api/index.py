"""
Vercel Serverless Entry Point — Valyze Credit Report Backend

This is the ONLY file Vercel should use as entry point.
It creates a minimal FastAPI app that proxies to Supabase.
"""

import os
import sys

# Add backend directory to Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import re
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Create a clean FastAPI app (don't import main.py which triggers filesystem errors)
app = FastAPI(title="ValyzeCredit", version="1.0.0")

# ---------------------------------------------------------------------------
# CORS — dynamic origin matching that supports Vercel preview deployments
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    "http://localhost:1573",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "https://valyze-front.vercel.app",
    "https://valyze.vercel.app",
    "https://valyze-credit.vercel.app",
]

# Regex patterns for dynamic origins (Vercel preview deployments)
CORS_ALLOWED_ORIGIN_PATTERNS = [
    re.compile(r"^https://valyze-front-.*\.vercel\.app$"),
    re.compile(r"^https://valyze-.*\.vercel\.app$"),
]

FRONTEND_URL = os.getenv("FRONTEND_URL", "")
if FRONTEND_URL:
    CORS_ALLOWED_ORIGINS.append(FRONTEND_URL)


def _is_origin_allowed(origin: str) -> bool:
    if origin in CORS_ALLOWED_ORIGINS:
        return True
    return any(p.match(origin) for p in CORS_ALLOWED_ORIGIN_PATTERNS)


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    """Custom CORS middleware that supports regex origin matching."""

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")

        # Handle preflight
        if request.method == "OPTIONS":
            headers = {}
            if origin and _is_origin_allowed(origin):
                headers["Access-Control-Allow-Origin"] = origin
                headers["Access-Control-Allow-Methods"] = "*"
                headers["Access-Control-Allow-Headers"] = "*"
                headers["Access-Control-Allow-Credentials"] = "true"
                headers["Access-Control-Max-Age"] = "600"
            return Response(status_code=204, headers=headers)

        # Handle actual requests
        response = await call_next(request)
        if origin and _is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response


app.add_middleware(DynamicCORSMiddleware)

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

# Register all API routes
def _register_all_routers():
    from api.auth import router as auth_router
    from api.upload import router as upload_router
    from api.report import router as report_router
    from api.pdf import router as pdf_router
    from api.export import router as export_router
    from api.search import router as search_router
    from api.cloud import router as cloud_router

    # Auth router — /api/auth/* is public (login)
    app.include_router(auth_router)

    # Protected routers — require valid JWT
    from api.auth import get_current_user
    from fastapi import Depends

    for r in [upload_router, report_router, pdf_router,
              export_router, search_router, cloud_router]:
        r.dependencies.append(Depends(get_current_user))
        app.include_router(r)

_register_all_routers()