"""
Authentication API — JWT-based staff login backed by the Supabase `app_users` table.
Uses PBKDF2 (hashlib) instead of bcrypt to avoid C compilation on Vercel.

Token types (all signed with JWT_SECRET):
- staff  — from /api/auth/login, no `type` claim. Accepted ONLY as `Authorization: Bearer`.
- link   — from /api/auth/link-token, `type: "link"`, 120 s. Accepted ONLY as `?token=`
           on the routes the UI opens as raw browser URLs (pdf/export, /ready/storage).
- portal — from /api/portal/auth, `type: "portal"`, `aud: "portal"`. Never accepted here.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_DEFAULT_JWT_SECRET = "valyze-secret-change-in-production-2026"
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
LINK_TOKEN_TTL_SECONDS = 120
PORTAL_AUDIENCE = "portal"

_IS_PROD = (os.getenv("ENV", "").lower() == "production") or bool(os.getenv("VERCEL"))


def _resolve_jwt_secret() -> str:
    """Return the signing secret — never the public repo default in production.

    A hardcoded fallback secret lets anyone forge admin tokens. If JWT_SECRET is
    unset in production we derive a stable, secret-but-unpublished key from the
    Supabase key (always present in prod, never in the repo) so tokens stay
    unforgeable AND sessions survive serverless cold starts. Setting a real
    JWT_SECRET silences the warning and is still strongly recommended.
    """
    secret = os.getenv("JWT_SECRET", "").strip()
    if secret:
        return secret

    if _IS_PROD:
        anchor = (os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY") or "").strip()
        if anchor:
            print(
                "[CRITICAL] JWT_SECRET is not set — deriving a temporary signing key "
                "from the Supabase key. Set a strong JWT_SECRET env var now."
            )
            return hashlib.sha256(f"valyze-jwt-v1|{anchor}".encode()).hexdigest()
        print(
            "[CRITICAL] JWT_SECRET is not set and no Supabase key is available to "
            "derive one — using a random per-process key. Sessions will not survive "
            "a cold start until you set JWT_SECRET."
        )
        return os.urandom(32).hex()

    print(
        "[WARNING] JWT_SECRET is not set — using the public dev default. "
        "Fine for local dev only; set a strong JWT_SECRET in production."
    )
    return _DEFAULT_JWT_SECRET


JWT_SECRET = _resolve_jwt_secret()
VALID_ROLES = {"super_admin", "admin", "analyst", "reviewer"}
ORDER_ASSIGNABLE_ROLES = {"admin", "analyst"}

security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Simple SHA-256 hashing (no bcrypt dependency)
# ---------------------------------------------------------------------------

_PBKDF2_ITERATIONS = 200_000


def _hash(password: str) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 (stdlib — no C build for Vercel)."""
    salt = os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS)
    return f"pbkdf2${_PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def _verify(password: str, stored: str) -> bool:
    """Verify a password against a stored hash.

    Accepts the current PBKDF2 format and the legacy `salt:sha256` format, so
    accounts seeded before the KDF upgrade keep working (they re-hash to PBKDF2
    the next time their password is set).
    """
    if not stored:
        return False
    try:
        if stored.startswith("pbkdf2$"):
            _, iters, salt, expected = stored.split("$", 3)
            dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iters))
            return hmac.compare_digest(dk.hex(), expected)
        salt, h = stored.split(":", 1)
        return hmac.compare_digest(hashlib.sha256((salt + password).encode()).hexdigest(), h)
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# User Store  (persisted in Supabase `app_users`, seeded from these accounts)
# ---------------------------------------------------------------------------

# Bootstrap accounts. On first run (empty app_users table) these are written to
# the database. After that, the database is the source of truth and the Users
# page can add/edit/remove accounts that persist across deploys and instances.
# Passwords are NOT in source: each comes from the environment
# (SEED_PASSWORD_<ID>, e.g. SEED_PASSWORD_USR_000, or VALYZE_SEED_PASSWORDS as a
# JSON object keyed by id or email) or is generated randomly and printed to the
# log exactly once when the account is created. Change them after first login.
SEED_USERS = [
    {"id": "usr_000", "email": "superadmin@valyze.com", "name": "Super Admin", "role": "super_admin"},
    {"id": "usr_001", "email": "waleed@valyze.com",     "name": "Waleed",      "role": "admin"},
    {"id": "usr_002", "email": "mohamed@valyze.com",    "name": "Mohamed",     "role": "analyst"},
    {"id": "usr_003", "email": "mahmoud@valyze.com",    "name": "Mahmoud",     "role": "analyst"},
    {"id": "usr_004", "email": "amani@valyze.com",      "name": "Amani",       "role": "analyst"},
    {"id": "usr_005", "email": "sally@valyze.com",      "name": "Sally",       "role": "admin"},
]

# Short in-process cache so we don't hit the DB on every request.
_USERS_TTL = 30.0
# If a refresh fails, keep serving the last good copy for at most this long
# (so a transient DB blip doesn't log everyone out) and then fail closed.
_USERS_STALE_MAX = 300.0
_users_cache: dict = {"data": None, "ts": 0.0}
_dev_seed_cache: dict = {"rows": None}


class UserStoreUnavailable(Exception):
    """app_users could not be read (network/HTTP error, missing config)."""


def _env_seed_passwords() -> dict:
    raw = os.getenv("VALYZE_SEED_PASSWORDS", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        print("[WARNING] VALYZE_SEED_PASSWORDS is not valid JSON — ignoring it")
        return {}
    if not isinstance(data, dict):
        print("[WARNING] VALYZE_SEED_PASSWORDS must be a JSON object — ignoring it")
        return {}
    return {str(k).lower(): str(v) for k, v in data.items() if v}


def _seed_password(seed: dict, from_json: dict) -> tuple[str, bool]:
    """Return (password, generated). Env wins; otherwise a random password."""
    candidate = (
        os.getenv(f"SEED_PASSWORD_{seed['id'].upper()}")
        or from_json.get(seed["id"].lower())
        or from_json.get(seed["email"].lower())
        or ""
    )
    if candidate and len(candidate) >= 8:
        return candidate, False
    if candidate:
        print(f"[WARNING] Seed password for {seed['email']} is shorter than 8 characters — generating one instead")
    return secrets.token_urlsafe(12), True


def _seed_rows() -> tuple[list[dict], dict]:
    """Hash the seed accounts into storable rows.

    Returns (rows, generated) where `generated` maps email -> plaintext for the
    passwords that were randomly generated (so the caller can log them once).
    """
    from_json = _env_seed_passwords()
    rows: list[dict] = []
    generated: dict = {}
    for seed in SEED_USERS:
        password, was_generated = _seed_password(seed, from_json)
        if was_generated:
            generated[seed["email"]] = password
        rows.append({**seed, "password_hash": _hash(password)})
    return rows, generated


def _announce_generated(generated: dict, where: str) -> None:
    for email, password in generated.items():
        print(
            f"[SECURITY] Bootstrap account {email} ({where}) was given a generated "
            f"password: {password}  — log in and change it now. It will not be shown again."
        )


def _fetch_app_users() -> list[dict]:
    """Read every app_users row, raising UserStoreUnavailable on any failure.

    services.supabase_client.get_all_app_users() returns [] on errors, which is
    indistinguishable from an empty table — and "empty" triggers seeding. Auth
    needs the difference, so it reads the table itself.
    """
    if not os.getenv("SUPABASE_URL"):
        raise UserStoreUnavailable("SUPABASE_URL is not set")
    import requests
    from services.supabase_client import get_base_url, get_headers

    try:
        response = requests.get(
            f"{get_base_url()}/app_users",
            params={"select": "*", "order": "created_at.asc.nullslast"},
            headers=get_headers(),
            timeout=15,
        )
    except requests.exceptions.RequestException as e:
        raise UserStoreUnavailable(f"request failed: {e}") from e
    if response.status_code >= 400:
        raise UserStoreUnavailable(f"HTTP {response.status_code}: {response.text[:200]}")
    try:
        rows = response.json() if response.text else []
    except ValueError as e:
        raise UserStoreUnavailable("unparseable response") from e
    if not isinstance(rows, list):
        raise UserStoreUnavailable("unexpected response shape")
    return rows


def _seed_database() -> list[dict]:
    """First run: write the bootstrap accounts, then re-read the table."""
    from services.supabase_client import bulk_insert_app_users

    rows, generated = _seed_rows()
    if not bulk_insert_app_users(rows):
        raise UserStoreUnavailable("seeding app_users failed")
    stored = _fetch_app_users()
    if not stored:
        raise UserStoreUnavailable("app_users is still empty after seeding")
    # Another instance may have seeded concurrently (inserts ignore duplicates),
    # so only announce the passwords that actually landed in the table.
    by_email = {(r.get("email") or "").lower(): r for r in stored}
    persisted = {
        email: pw for email, pw in generated.items()
        if _verify(pw, (by_email.get(email) or {}).get("password_hash") or "")
    }
    _announce_generated(persisted, "seeded into app_users")
    return stored


def _dev_seed_rows() -> list[dict]:
    """In-memory accounts for local dev without a database (never in prod).
    Generated once per process so the logged passwords stay valid."""
    if _dev_seed_cache["rows"] is None:
        rows, generated = _seed_rows()
        _announce_generated(generated, "in-memory, local dev only")
        _dev_seed_cache["rows"] = rows
    return _dev_seed_cache["rows"]


def _invalidate_users_cache() -> None:
    _users_cache["data"] = None
    _users_cache["ts"] = 0.0


def _load_users(force: bool = False) -> dict:
    """Return {email_lower: user_row}. Loads from Supabase, seeding on first run.

    If the table can't be read: serve the last good copy for a short while, then
    fail closed in production (503). Only local dev falls back to in-memory seeds.
    """
    now = time.time()
    cached = _users_cache["data"]
    if not force and cached is not None and (now - _users_cache["ts"]) < _USERS_TTL:
        return cached

    try:
        rows = _fetch_app_users()
        if not rows:
            rows = _seed_database()
    except UserStoreUnavailable as e:
        print(f"[WARNING] Could not load users from Supabase ({e})")
        if cached is not None and (now - _users_cache["ts"]) < _USERS_STALE_MAX:
            return cached
        if _IS_PROD:
            raise HTTPException(status_code=503, detail="Authentication is temporarily unavailable")
        print("[WARNING] Using in-memory seed accounts (local dev only)")
        rows = _dev_seed_rows()

    by_email = {(r.get("email") or "").lower(): r for r in rows}
    _users_cache["data"] = by_email
    _users_cache["ts"] = now
    return by_email


# ---------------------------------------------------------------------------
# Login throttling (per client IP and per account, in-process)
# ---------------------------------------------------------------------------

LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_FAILURES_PER_ACCOUNT = 10
LOGIN_MAX_FAILURES_PER_IP = 30
_THROTTLE_MAX_KEYS = 10_000


class LoginThrottle:
    """Sliding-window failed-attempt counter. Lives in process memory, so each
    serverless instance counts separately and a cold start resets it."""

    def __init__(self, scope: str):
        self.scope = scope
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _account_key(account: str) -> str:
        return "acct:" + hashlib.sha256((account or "").strip().lower().encode()).hexdigest()

    def _recent(self, key: str, now: float) -> list[float]:
        stamps = [t for t in self._failures.get(key, ()) if now - t < LOGIN_WINDOW_SECONDS]
        if stamps:
            self._failures[key] = stamps
        else:
            self._failures.pop(key, None)
        return stamps

    def _limits(self, ip: str, account: str) -> Iterable[tuple[str, int]]:
        yield self._account_key(account), LOGIN_MAX_FAILURES_PER_ACCOUNT
        if ip:
            yield "ip:" + ip, LOGIN_MAX_FAILURES_PER_IP

    def check(self, ip: str, account: str) -> None:
        now = time.time()
        with self._lock:
            for key, limit in self._limits(ip, account):
                stamps = self._recent(key, now)
                if len(stamps) >= limit:
                    retry_after = max(1, int(LOGIN_WINDOW_SECONDS - (now - stamps[0])))
                    raise HTTPException(
                        status_code=429,
                        detail="Too many failed attempts. Try again later.",
                        headers={"Retry-After": str(retry_after)},
                    )

    def record_failure(self, ip: str, account: str) -> None:
        now = time.time()
        with self._lock:
            if len(self._failures) > _THROTTLE_MAX_KEYS:
                for key in list(self._failures):
                    self._recent(key, now)
                if len(self._failures) > _THROTTLE_MAX_KEYS:
                    self._failures.clear()
            for key, _ in self._limits(ip, account):
                self._failures.setdefault(key, []).append(now)

    def record_success(self, account: str) -> None:
        with self._lock:
            self._failures.pop(self._account_key(account), None)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()


def client_ip(request: Request) -> str:
    """Best-effort client IP. On Vercel the edge overwrites x-real-ip /
    x-forwarded-for with the real client address; elsewhere use the socket peer
    (uvicorn rewrites it from X-Forwarded-For when run with --proxy-headers)."""
    if os.getenv("VERCEL"):
        forwarded = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for") or ""
        ip = forwarded.split(",", 1)[0].strip()
        if ip:
            return ip
    return request.client.host if request.client else ""


staff_login_throttle = LoginThrottle("staff")

# Constant-cost dummy hash so unknown emails take as long as wrong passwords.
_DUMMY_HASH = _hash(secrets.token_hex(8))


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


def create_link_token(user: dict) -> str:
    """Short-lived token for URLs the browser opens directly (`?token=`)."""
    payload = {
        "sub": user["sub"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "type": "link",
        "exp": datetime.now(timezone.utc) + timedelta(seconds=LINK_TOKEN_TTL_SECONDS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Verify signature and expiry. Tokens carrying an `aud` claim (portal
    tokens) fail here because no audience is expected."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def _identity_from_payload(payload: dict, expected_type: Optional[str] = None) -> dict:
    """Map a decoded token to the live user record.

    `expected_type` None = staff login token (no `type` claim at all); "link" =
    short-lived URL token. The user is re-read from the (30 s cached) store on
    every request, so deleted users lose access and role changes apply at once.
    """
    if payload.get("type") != expected_type or payload.get("aud") is not None:
        raise HTTPException(401, "Invalid token")
    sub = payload.get("sub")
    if not sub or not payload.get("role"):
        raise HTTPException(401, "Invalid token")
    user = get_user_by_id(str(sub))
    if not user:
        raise HTTPException(401, "User no longer exists")
    return {
        "sub": user.get("id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "role": user.get("role"),
    }


def _bearer_token(request: Request) -> Optional[str]:
    scheme, _, value = (request.headers.get("authorization") or "").partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()
    return None


def authenticate_request(request: Request, allow_link_query: bool = False) -> dict:
    """Resolve the caller for handlers that can't use `Depends`.

    Header → staff token only. With `allow_link_query`, a `?token=` link token is
    accepted when there is no header. Raises 401 otherwise.
    """
    header_token = _bearer_token(request)
    if header_token:
        return _identity_from_payload(decode_token(header_token))
    if allow_link_query:
        query_token = request.query_params.get("token")
        if query_token:
            return _identity_from_payload(decode_token(query_token), expected_type="link")
    raise HTTPException(401, "Not authenticated")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """Staff guard: `Authorization: Bearer <staff login token>` only."""
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    return _identity_from_payload(decode_token(credentials.credentials))


def get_current_user_flexible(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """Authenticate via the Authorization header OR a `?token=` link token.

    Required for endpoints the UI opens as raw browser URLs (window.open /
    link.href) that cannot attach an Authorization header — PDF previews and
    file downloads. The query string only ever carries a 120 s link token from
    POST /api/auth/link-token, never the 24 h login token.
    """
    if credentials is not None:
        return _identity_from_payload(decode_token(credentials.credentials))
    token = request.query_params.get("token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    return _identity_from_payload(decode_token(token), expected_type="link")


def require_admin(user: dict) -> None:
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required")


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
def login(body: LoginRequest, request: Request):
    """Authenticate user and return JWT token."""
    email = _normalize_email(body.email)
    ip = client_ip(request)
    staff_login_throttle.check(ip, email)
    user = _load_users().get(email)
    password_ok = _verify(body.password, user["password_hash"] if user else _DUMMY_HASH)
    if not user or not password_ok:
        staff_login_throttle.record_failure(ip, email)
        raise HTTPException(401, "Invalid email or password")
    staff_login_throttle.record_success(email)

    token = create_token(user)
    return {
        "token": token,
        "user": public_user(user),
    }


@router.post("/link-token")
async def issue_link_token(user: dict = Depends(get_current_user)):
    """Mint a 120 s token for one browser-opened URL (`?token=`)."""
    return {"token": create_link_token(user), "expires_in": LINK_TOKEN_TTL_SECONDS}


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
