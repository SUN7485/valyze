"""
Vercel Serverless Entry Point — Valyze Credit Report Backend
Minimal version: lazy-load everything to avoid cold-start crashes.
"""
import os
import sys
import traceback
import importlib

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

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


# Safety-net middleware: ensures CORS headers are present on EVERY response,
# even ones that bypass FastAPI (e.g. Starlette errors, 413 from body parser).
class CORSSafetyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception as exc:
            body = getattr(exc, "body", b"")
            status = getattr(exc, "status_code", 500)
            response = Response(
                content=body or b'{"detail":"Request too large or server error"}',
                status_code=status,
                media_type="application/json",
            )
        # Ensure Access-Control-Allow-Origin is always present
        origin = request.headers.get("origin", "*")
        if "access-control-allow-origin" not in response.headers:
            response.headers["access-control-allow-origin"] = origin
            response.headers["access-control-allow-methods"] = "*"
            response.headers["access-control-allow-headers"] = "*"
        return response

app.add_middleware(CORSSafetyMiddleware)

# Public routes — no auth needed
@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "max_body_mb": 4}


@app.get("/ready")
async def ready():
    try:
        from services.supabase_client import get_reports_count
        count = get_reports_count()
        return {"status": "ok", "supabase": "connected", "db_status": f"connected ({count} reports)"}
    except Exception as e:
        return JSONResponse(content={"status": "error", "supabase": "unavailable", "error": str(e)}, status_code=503)


# Debug — shows which routers loaded and all routes
@app.get("/routes")
async def list_routes():
    routes = []
    for r in app.routes:
        if hasattr(r, "path") and hasattr(r, "methods"):
            routes.append({"path": r.path, "methods": list(r.methods)})
        elif hasattr(r, "path"):
            routes.append({"path": r.path, "methods": ["*"]})
    return {"routes": routes, "registered": _registered}


# Register routers one-by-one so one failure doesn't block all
_registered = {}

def _safe_register(name, module_path):
    try:
        mod = importlib.import_module(module_path)
        router = getattr(mod, "router")
        app.include_router(router)
        _registered[name] = "OK"
        print(f"[OK] {name}")
    except Exception as e:
        _registered[name] = f"FAIL: {e}"
        print(f"[FAIL] {name}: {e}")
        traceback.print_exc()

# Auth first (critical), then everything else
_safe_register("auth", "api.auth")
_safe_register("upload", "api.upload")
_safe_register("report", "api.report")
_safe_register("pdf", "api.pdf")
_safe_register("export", "api.export")
_safe_register("search", "api.search")
_safe_register("cloud", "api.cloud")
_safe_register("proxy", "api.proxy")