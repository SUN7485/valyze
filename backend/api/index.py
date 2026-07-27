"""
Vercel Serverless Entry Point — Valyze Credit Report Backend
Minimal version: lazy-load everything to avoid cold-start crashes.
"""
import os
import sys
import traceback
import importlib

from starlette.middleware.base import BaseHTTPMiddleware

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="ValyzeCredit", version="1.0.0")

# CORS — allow configured Vercel/frontend origins.
CORS_ORIGINS = [
    "http://localhost:1573",
    "http://localhost:1574",
    "http://localhost:1575",
    "http://localhost:5173",
    "http://localhost:5175",
    "http://localhost:5176",
    "http://localhost:5177",
    "http://localhost:5178",
    "http://localhost:5179",
    "http://localhost:3000",
]
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip()
PORTAL_URL = os.getenv("PORTAL_URL", "").strip()
if FRONTEND_URL:
    CORS_ORIGINS.append(FRONTEND_URL)
if PORTAL_URL:
    CORS_ORIGINS.append(PORTAL_URL)
for origin in os.getenv("CORS_EXTRA_ORIGINS", "").split(","):
    origin = origin.strip()
    if origin:
        CORS_ORIGINS.append(origin)
CORS_ALLOW_ALL = "*" in CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=not CORS_ALLOW_ALL,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Safety-net middleware: ensures CORS headers are present on allowed origins,
# even on errors that bypass FastAPI (e.g. Starlette errors, 413 from body parser).
class CORSSafetyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
        except Exception as exc:
            traceback.print_exc()
            status = getattr(exc, "status_code", 500)
            if status == 413:
                detail = "Request body too large for serverless"
            else:
                # Preserve intentional HTTPException detail; never leak a raw exception string.
                detail = getattr(exc, "detail", None) or "Internal server error"
            response = JSONResponse(status_code=status, content={"detail": detail})
        origin = request.headers.get("origin", "")
        if "access-control-allow-origin" not in response.headers:
            if CORS_ALLOW_ALL:
                response.headers["access-control-allow-origin"] = "*"
            elif origin and origin in CORS_ORIGINS:
                response.headers["access-control-allow-origin"] = origin
            response.headers["access-control-allow-methods"] = "*"
            response.headers["access-control-allow-headers"] = "*"
        # Baseline security headers on every response.
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

app.add_middleware(CORSSafetyMiddleware)

# Public routes — no auth needed
def _is_prod() -> bool:
    return bool(os.getenv("VERCEL")) or os.getenv("ENV", "").lower() == "production"


@app.get("/health")
async def health():
    # In prod, don't leak which env vars are configured — return a minimal payload.
    if _is_prod():
        return {"status": "ok", "version": "1.0.0"}
    supabase_key = bool(os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY"))
    return {
        "status": "ok",
        "version": "1.0.0",
        "max_body_mb": 4.5,
        "env": {
            "supabase_url": bool(os.getenv("SUPABASE_URL")),
            "supabase_key": supabase_key,
            "frontend_url": bool(FRONTEND_URL),
            "portal_url": bool(PORTAL_URL),
            "cors_origins_count": len(CORS_ORIGINS),
        },
    }


@app.get("/ready")
async def ready():
    missing_env = _missing_supabase_env()
    if missing_env:
        return JSONResponse(
            content={
                "status": "error",
                "supabase": "missing_env",
                "missing_env": missing_env,
            },
            status_code=503,
        )

    try:
        from services.supabase_client import get_reports_count
        count = get_reports_count()
        return {"status": "ok", "supabase": "connected", "db_status": f"connected ({count} reports)"}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"status": "error", "supabase": "unavailable", "error": str(e)}, status_code=503)


def _missing_supabase_env() -> list[str]:
    missing_env = []
    if not os.getenv("SUPABASE_URL"):
        missing_env.append("SUPABASE_URL")
    if not os.getenv("SUPABASE_SERVICE_KEY") and not os.getenv("SUPABASE_ANON_KEY"):
        missing_env.append("SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY")
    return missing_env


@app.get("/ready/tables")
async def ready_tables():
    missing_env = _missing_supabase_env()
    if missing_env:
        return JSONResponse(
            content={"status": "error", "missing_env": missing_env},
            status_code=503,
        )

    try:
        from services.supabase_client import (
            get_all_clients,
            get_all_invoices,
            get_all_orders,
            get_all_reports,
        )
        counts = {
            "reports": len(get_all_reports()),
            "clients": len(get_all_clients()),
            "orders": len(get_all_orders()),
            "invoices": len(get_all_invoices()),
        }
        return {"status": "ok", "tables": counts}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={"status": "error", "error": str(e)}, status_code=503)


@app.get("/ready/storage")
async def ready_storage():
    """Report why the portal file pipeline is or isn't usable.

    Storage failures are near-impossible to diagnose from the client: bucket
    endpoints are governed by RLS on `storage.buckets`, so a non-service_role key
    is told "Bucket not found" for a bucket that plainly exists, and every cause
    collapses into the same 503. This reports the distinguishing facts.

    Deliberately leaks no secrets: the project ref and the key's `role` claim are
    both public-safe (the ref appears in every frontend bundle), and the key
    itself is never echoed.
    """
    import base64
    import json as _json

    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    role = None
    if key.count(".") == 2:
        try:
            payload = key.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            role = _json.loads(base64.urlsafe_b64decode(payload)).get("role")
        except Exception:
            role = "undecodable"

    # Shape of the key, never its value. `role` comes back null when the value
    # isn't a 3-part JWT at all — which is what Supabase's newer `sb_secret_…` /
    # `sb_publishable_…` keys look like, and also what a truncated or
    # quote-wrapped paste looks like. Distinguishing those is the whole game.
    if key.startswith("sb_secret_"):
        key_format = "sb_secret (new-style secret key)"
    elif key.startswith("sb_publishable_"):
        key_format = "sb_publishable (new-style PUBLIC key — cannot do storage admin)"
    elif key.startswith("eyJ"):
        key_format = "jwt"
    elif not key:
        key_format = "empty"
    else:
        key_format = "unrecognised"

    diag = {
        "supabase_url": os.getenv("SUPABASE_URL") or None,
        "service_key_set": bool(os.getenv("SUPABASE_SERVICE_KEY")),
        "key_format": key_format,
        "key_length": len(key),
        "key_looks_quoted": key.startswith(('"', "'")) or key.endswith(('"', "'")),
        "key_has_whitespace": key != key.strip(),
        "key_role": role,
        "key_is_service_role": role == "service_role",
    }

    # Raw storage responses. Status codes and Supabase's own error bodies carry no
    # secrets, and they separate "denied" from "absent" — which the bucket
    # endpoints otherwise conflate under RLS.
    try:
        import requests as _rq

        from services.supabase_client import get_storage_base_url

        _h = {"apikey": key, "Authorization": f"Bearer {key}"}
        for label, path in (("probe_by_name", "/bucket/portal-uploads"), ("list_buckets", "/bucket")):
            r = _rq.get(f"{get_storage_base_url()}{path}", headers=_h, timeout=15)
            diag[label] = {"http": r.status_code, "body": r.text[:200]}
    except Exception as e:
        diag["storage_probe_error"] = str(e)
    if role != "service_role":
        diag["diagnosis"] = (
            "This backend is NOT running with a service_role key. Bucket administration "
            "and uploads into a private bucket both require service_role. Set "
            "SUPABASE_SERVICE_KEY on the BACKEND Vercel project (Production scope), then redeploy."
        )

    # Actually exercise the pipeline the portal uses, so the answer is observed
    # rather than inferred from the key alone.
    try:
        from api.portal import PORTAL_STORAGE_BUCKET
        from services.supabase_client import ensure_storage_bucket

        diag["bucket"] = PORTAL_STORAGE_BUCKET
        diag["bucket_ready"] = ensure_storage_bucket(PORTAL_STORAGE_BUCKET)
    except Exception as e:
        diag["bucket_ready"] = False
        diag["bucket_error"] = str(e)

    diag["status"] = "ok" if diag.get("bucket_ready") else "error"
    return JSONResponse(content=diag, status_code=200 if diag["status"] == "ok" else 503)


# Debug — shows which routers loaded and all routes
@app.get("/routes")
async def list_routes():
    # Recon aid — hide the route map in prod.
    if _is_prod():
        raise HTTPException(status_code=404, detail="Not found")
    routes = []
    for r in app.routes:
        if hasattr(r, "path") and hasattr(r, "methods"):
            routes.append({"path": r.path, "methods": list(r.methods)})
        elif hasattr(r, "path"):
            routes.append({"path": r.path, "methods": ["*"]})
    return {"routes": routes, "registered": _registered}


# Register routers one-by-one so one failure doesn't block all
_registered = {}

def _safe_register(name, module_path, prefix=None, tags=None, dependencies=None):
    try:
        mod = importlib.import_module(module_path)
        router = getattr(mod, "router")
        kwargs = {"tags": tags or []}
        if prefix:
            kwargs["prefix"] = prefix
        if dependencies:
            kwargs["dependencies"] = dependencies
        app.include_router(router, **kwargs)
        _registered[name] = "OK"
        print(f"[OK] {name}")
    except Exception as e:
        _registered[name] = f"FAIL: {e}"
        print(f"[FAIL] {name}: {e}")
        traceback.print_exc()


# Router-level auth: protect the report data layer. These endpoints are all
# consumed by the frontend through the token-attaching API client (or fetch with
# an explicit Bearer token), so requiring auth here closes the public hole
# without breaking any flow.
# NOTE: pdf + export endpoints carry confidential report data, so they are now
# protected too — via a header-OR-query-token guard (get_current_user_flexible),
# because the UI opens them as raw browser URLs (window.open / link.href) that
# cannot send an Authorization header. The frontend appends `?token=<jwt>`.
try:
    from api.auth import (
        get_current_user as _auth_dep,
        get_current_user_flexible as _auth_dep_flex,
    )
    _PROTECTED = [Depends(_auth_dep)]
    _PROTECTED_FLEX = [Depends(_auth_dep_flex)]
except Exception as _e:  # pragma: no cover - defensive
    print(f"[WARN] could not load auth dependency: {_e}")
    # Fail CLOSED: if the auth dependency can't be loaded we must NOT register the
    # protected routers wide-open (dependencies=None disables auth entirely). Use a
    # hard-deny dependency so report/upload/search/cloud/pdf/export return 503
    # instead of silently exposing every report and order.
    async def _auth_unavailable() -> None:
        raise HTTPException(status_code=503, detail="Authentication is unavailable")
    _PROTECTED = [Depends(_auth_unavailable)]
    _PROTECTED_FLEX = [Depends(_auth_unavailable)]

# Auth first (critical), then everything else.
# Routers with their own /api/* prefix are registered without an extra prefix.
_safe_register("auth", "api.auth")
_safe_register("portal", "api.portal", prefix="/api/portal", tags=["portal"])
_safe_register("upload", "api.upload", dependencies=_PROTECTED)
_safe_register("report", "api.report", dependencies=_PROTECTED)
_safe_register("pdf", "api.pdf", dependencies=_PROTECTED_FLEX)
_safe_register("export", "api.export", dependencies=_PROTECTED_FLEX)
_safe_register("invoices", "api.invoices", prefix="/api/invoices", tags=["invoices"])
_safe_register("search", "api.search", dependencies=_PROTECTED)
_safe_register("cloud", "api.cloud", dependencies=_PROTECTED)
_safe_register("clients", "api.clients", prefix="/api/clients", tags=["clients"])
_safe_register("orders", "api.orders", prefix="/api/orders", tags=["orders"])
_safe_register("companies", "api.companies")
_safe_register("proxy", "api.proxy")
