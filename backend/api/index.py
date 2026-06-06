"""
Vercel Serverless Entry Point — Valyze Credit Report Backend
Minimal version: lazy-load everything to avoid cold-start crashes.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="ValyzeCredit", version="1.0.0")

# CORS — open to all
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public routes — no auth needed
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
        return JSONResponse(content={"status": "error", "supabase": "unavailable", "error": str(e)}, status_code=503)


# Lazy-load routers to avoid import-time crashes
def _register_routers():
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

try:
    _register_routers()
except Exception as e:
    print(f"[WARN] Router registration failed on cold start: {e}")
