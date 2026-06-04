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

# Register only the auth router (public login endpoint)
# Protected routers omitted to avoid dependency issues
from api.auth import router as auth_router
app.include_router(auth_router)
