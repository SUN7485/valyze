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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create a clean FastAPI app (don't import main.py which triggers filesystem errors)
app = FastAPI(title="ValyzeCredit", version="1.0.0")

# CORS - allow all in serverless (frontend origin set in env)
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
CORS_ORIGINS = [
    "http://localhost:1573",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
]
if FRONTEND_URL:
    CORS_ORIGINS.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

# Register all API routes (lazy imports that won't trigger filesystem writes)
def _register_all_routers():
    # These imports are safe because api/export.py no longer calls mkdir at module level
    # (It was changed to use /tmp/outputs without any mkdir)
    from api.upload import router as upload_router
    from api.report import router as report_router
    from api.pdf import router as pdf_router
    from api.export import router as export_router
    from api.search import router as search_router
    from api.cloud import router as cloud_router

    app.include_router(upload_router)
    app.include_router(report_router)
    app.include_router(pdf_router)
    app.include_router(export_router)
    app.include_router(search_router)
    app.include_router(cloud_router)

_register_all_routers()