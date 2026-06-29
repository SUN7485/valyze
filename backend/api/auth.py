"""
Authentication API — JWT-based login with hardcoded users.
Uses SHA-256 (hashlib) instead of bcrypt to avoid C compilation on Vercel.
"""

from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_DEFAULT_JWT_SECRET = "valyze-secret-change-in-production-2026"
JWT_SECRET = os.getenv("JWT_SECRET", _DEFAULT_JWT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# Security guard: a hardcoded fallback secret means anyone can forge admin tokens.
# Warn loudly in production rather than crash (so a misconfig doesn't lock everyone out).
if JWT_SECRET == _DEFAULT_JWT_SECRET:
    _is_prod = (os.getenv("ENV", "").lower() == "production") or bool(os.getenv("VERCEL"))
    _level = "CRITICAL" if _is_prod else "WARNING"
    print(
        f"[{_level}] JWT_SECRET is not set — using the public default. "
        "Set a strong JWT_SECRET env var in your deployment; otherwise tokens can be forged."
    )
VALID_ROLES = {"super_admin", "admin", "analyst", "reviewer"}
ORDER_ASSIGNABLE_ROLES = {"admin", "analyst"}

security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Simple SHA-256 hashing (no bcrypt dependency)
# ---------------------------------------------------------------------------

def _hash(password: str) -> str:
    """SHA-256 hash with a random salt for simple password storage."""
    salt = os.urandom(16).hex()
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{h}"


def _verify(password: str, stored: str) -> bool:
    """Verify password against stored hash."""
    try:
        salt, h = stored.split(":", 1)
        return hashlib.sha256((salt + password).encode()).hexdigest() == h
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# User Store  (persisted in Supabase `app_users`, seeded from these accounts)
# ---------------------------------------------------------------------------

# Bootstrap accounts. On first run (empty app_users table) these are written to
# the database. After that, the database is the source of truth and the Users
# page can add/edit/remove accounts that persist across deploys and instances.
SEED_USERS = [
    {"id": "usr_000", "email": "superadmin@valyze.com", "name": "Super Admin", "role": "super_admin", "password": "Superadmin@123"},
    {"id": "usr_001", "email": "waleed@valyze.com",     "name": "Waleed",      "role": "admin",       "password": "Waleed@123"},
    {"id": "usr_002", "email": "mohamed@valyze.com",    "name": "Mohamed",     "role": "admin",       "password": "Mohamed@123"},
    {"id": "usr_003", "email": "mahmoud@valyze.com",    "name": "Mahmoud",     "role": "admin",       "password": "Mahmoud@123"},
    {"id": "usr_004", "email": "amani@valyze.com",      "name": "Amani",       "role": "admin",       "password": "Amani@123"},
    {"id": "usr_005", "email": "sally@valyze.com",      "name": "Sally",       "role": "admin",       "password": "Sally@123"},
]

# Short in-process cache so we don't hit the DB on every assign/login.
_USERS_TTL = 30.0
_users_cache: dict = {"data": None, "ts": 0.0}


def _seed_rows() -> list[dict]:
    """Hash the seed accounts into storable rows."""
    return [
        {"id": s["id"], "email": s["email"], "name": s["name"], "role": s["role"], "password_hash": _hash(s["password"])}
        for s in SEED_USERS
    ]


def _invalidate_users_cache() -> None:
    _users_cache["data"] = None
    _users_cache["ts"] = 0.0


def _load_users(force: bool = False) -> dict:
    """Return {email_lower: user_row}. Loads from Supabase, seeding on first run.
    Falls back to in-memory seed accounts if the database is unreachable so the
    core team can always log in."""
    now = time.time()
    cached = _users_cache["data"]
    if not force and cached is not None and (now - _users_cache["ts"]) < _USERS_TTL:
        return cached

    rows: list[dict] = []
    try:
        from services.supabase_client import get_all_app_users, bulk_insert_app_users
        rows = get_all_app_users()
        if not rows:
            # First run — seed the table, then re-read.
            bulk_insert_app_users(_seed_rows())
            rows = get_all_app_users()
    except Exception as e:  # pragma: no cover - defensive
        print(f"[WARNING] Could not load users from Supabase ({e}); using in-memory seeds")

    if not rows:
        rows = _seed_rows()

    by_email = {(r.get("email") or "").lower(): r for r in rows}
    _users_cache["data"] = by_email
    _users_cache["ts"] = now
    return by_email


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_email(email: str) -> str:
    return email.lower().strip()


def public_user(user: dict) -> dict:
    return {
        "id": user.get("id") or user.get("sub"),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }


def list_users() -> list[dict]:
    return [public_user(user) for user in _load_users().values()]


def get_user_by_id(user_id: str) -> Optional[dict]:
    return next((user for user in _load_users().values() if user["id"] == user_id), None)


def _next_user_id() -> str:
    users = _load_users()
    max_n = 0
    for u in users.values():
        suffix = str(u.get("id") or "").rsplit("_", 1)[-1]
        if suffix.isdigit():
            max_n = max(max_n, int(suffix))
    return f"usr_{max_n + 1:03d}"


def require_super_admin(user: dict) -> None:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin permission required")


def get_order_assignable_users() -> list[str]:
    return [
        email
        for email, user in _load_users().items()
        if user.get("role") in ORDER_ASSIGNABLE_ROLES
    ]


def create_user(email: str, name: str, role: str, password: str) -> dict:
    normalized_email = _normalize_email(email)
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Email is required")
    if normalized_email in _load_users():
        raise HTTPException(status_code=409, detail="User already exists")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {', '.join(sorted(VALID_ROLES))}")
    if len(password or "") < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = {
        "id": _next_user_id(),
        "email": normalized_email,
        "name": name.strip() or normalized_email.split("@", 1)[0],
        "role": role,
        "password_hash": _hash(password),
    }
    from services.supabase_client import insert_app_user
    created = insert_app_user(user)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create user")
    _invalidate_users_cache()
    return public_user(user)


def update_user(user_id: str, updates: dict) -> dict:
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    patch: dict = {}

    if "email" in updates:
        normalized_email = _normalize_email(updates.get("email") or "")
        if not normalized_email:
            raise HTTPException(status_code=400, detail="Email is required")
        existing = _load_users()
        if normalized_email != user["email"] and normalized_email in existing:
            raise HTTPException(status_code=409, detail="Email already exists")
        patch["email"] = normalized_email

    if "name" in updates:
        patch["name"] = (updates.get("name") or "").strip() or user["email"].split("@", 1)[0]

    if "role" in updates:
        role = updates.get("role") or ""
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {', '.join(sorted(VALID_ROLES))}")
        if user["role"] == "super_admin" and role != "super_admin":
            raise HTTPException(status_code=409, detail="Cannot demote the super admin")
        patch["role"] = role

    if "password" in updates:
        password = updates.get("password") or ""
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        patch["password_hash"] = _hash(password)

    if not patch:
        return public_user(user)

    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    from services.supabase_client import update_app_user as sb_update_app_user
    updated = sb_update_app_user(user_id, patch)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to update user")
    _invalidate_users_cache()
    return public_user({**user, **patch})


def delete_user(user_id: str) -> dict:
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "super_admin":
        raise HTTPException(status_code=409, detail="Cannot delete the super admin")
    from services.supabase_client import delete_app_user as sb_delete_app_user
    if not sb_delete_app_user(user_id):
        raise HTTPException(status_code=500, detail="Failed to delete user")
    _invalidate_users_cache()
    return {"deleted": True, "user_id": user_id}

def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    return decode_token(credentials.credentials)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class CreateUserRequest(BaseModel):
    email: str
    name: str
    role: str = "analyst"
    password: str


class UpdateUserRequest(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login")
async def login(body: LoginRequest):
    """Authenticate user and return JWT token."""
    user = _load_users().get(_normalize_email(body.email))
    if not user or not _verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = create_token(user)
    return {
        "token": token,
        "user": public_user(user),
    }


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return current authenticated user info."""
    return public_user(user)


@router.post("/verify")
async def verify_token(user: dict = Depends(get_current_user)):
    """Verify that a token is valid."""
    return {"valid": True, "user": user["email"]}


@router.get("/users")
async def list_users_endpoint(user: dict = Depends(get_current_user)):
    require_super_admin(user)
    return {"users": list_users()}


@router.post("/users")
async def create_user_endpoint(body: CreateUserRequest, user: dict = Depends(get_current_user)):
    require_super_admin(user)
    return create_user(body.email, body.name, body.role, body.password)


@router.patch("/users/{user_id}")
async def update_user_endpoint(user_id: str, body: UpdateUserRequest, user: dict = Depends(get_current_user)):
    require_super_admin(user)
    return update_user(user_id, body.model_dump(exclude_unset=True))


@router.delete("/users/{user_id}")
async def delete_user_endpoint(user_id: str, user: dict = Depends(get_current_user)):
    require_super_admin(user)
    return delete_user(user_id)
