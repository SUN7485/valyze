"""
Vercel Serverless Entry Point — Valyze Credit Report Backend
"""
import os
import sys
import traceback

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Always import these - they're core requirements
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="ValyzeCredit", version="1.0.0")

# CORS
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
CORS_ORIGINS = [
    "http://localhost:1573",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "https://valyze-front.vercel.app",
    "https://valyze.vercel.app",
    "https://valyze-credit.vercel.app",
]
if FRONTEND_URL:
    CORS_ORIGINS.append(FRONTEND_URL)

CORS_EXTRA_ORIGINS = os.getenv("CORS_EXTRA_ORIGINS", "")
if CORS_EXTRA_ORIGINS:
    for origin in CORS_EXTRA_ORIGINS.split(","):
        origin = origin.strip()
        if origin:
            CORS_ORIGINS.append(origin)

cors_kwargs = dict(allow_methods=["*"], allow_headers=["*"])
if "*" in CORS_ORIGINS:
    cors_kwargs["allow_origins"] = ["*"]
    cors_kwargs["allow_credentials"] = False
else:
    cors_kwargs["allow_origins"] = CORS_ORIGINS
    cors_kwargs["allow_credentials"] = True

app.add_middleware(CORSMiddleware, **cors_kwargs)

# Auth middleware
try:
    from api.auth import decode_token
    PUBLIC_PATHS = {"/health", "/ready", "/"}

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        path = request.url.path
        if request.method == "OPTIONS":
            return await call_next(request)
        if path in PUBLIC_PATHS or path.startswith("/api/auth/") or path == "/api/proxy" or path == "/docs" or path == "/openapi.json":
            return await call_next(request)
        if path.startswith("/api/"):
            origin = request.headers.get("origin", "")
            auth_header = request.headers.get("Authorization", "")
            token = request.query_params.get("token", "") or ""
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1]
            if not token:
                resp = JSONResponse(status_code=401, content={"detail": "Not authenticated"})
                resp.headers["Access-Control-Allow-Origin"] = origin or "*"
                resp.headers["Access-Control-Allow-Credentials"] = "true"
                return resp
            try:
                decode_token(token)
            except Exception:
                resp = JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})
                resp.headers["Access-Control-Allow-Origin"] = origin or "*"
                resp.headers["Access-Control-Allow-Credentials"] = "true"
                return resp
        return await call_next(request)
except Exception as e:
    print(f"[WARN] Auth middleware setup failed: {e}")
    traceback.print_exc()


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


try:
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
except Exception as e:
    print(f"[WARN] Router registration failed: {e}")
    traceback.print_exc()
