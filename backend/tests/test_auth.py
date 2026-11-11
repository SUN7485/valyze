"""Auth: password hashing, JWTs, and the route guards api/index.py applies."""
import hashlib
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from api import auth
from api.index import app

client = TestClient(app)


def _user(role="analyst", password="Secret@123"):
    return {"id": "usr_t", "email": f"{role}@test.local", "name": role.title(), "role": role,
            "password_hash": auth._hash(password)}


@pytest.fixture
def users(monkeypatch):
    """Replace the Supabase-backed user store with an in-memory one."""
    store = {u["email"]: u for u in (_user("analyst"), _user("admin"))}
    monkeypatch.setattr(auth, "_load_users", lambda force=False: store)
    return store


def _bearer(role):
    return {"Authorization": f"Bearer {auth.create_token(_user(role))}"}


# --- passwords ---------------------------------------------------------------

def test_pbkdf2_hash_roundtrip_and_salting():
    h1, h2 = auth._hash("pw"), auth._hash("pw")
    assert h1.startswith("pbkdf2$") and h1 != h2
    assert auth._verify("pw", h1) and not auth._verify("wrong", h1)


def test_legacy_sha256_hash_still_verifies():
    legacy = "abc:" + hashlib.sha256(b"abcpw").hexdigest()
    assert auth._verify("pw", legacy) and not auth._verify("nope", legacy)


@pytest.mark.parametrize("stored", ["", None, "garbage", "pbkdf2$notanumber$salt$hash"])
def test_malformed_hashes_never_verify(stored):
    assert auth._verify("pw", stored) is False


# --- tokens ------------------------------------------------------------------

def test_token_roundtrip():
    claims = auth.decode_token(auth.create_token(_user("admin")))
    assert claims["sub"] == "usr_t" and claims["role"] == "admin"


@pytest.mark.parametrize("token", [
    jwt.encode({"sub": "x", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, auth.JWT_SECRET, algorithm="HS256"),
    jwt.encode({"sub": "x", "role": "admin"}, "some-other-secret-that-is-at-least-32-bytes", algorithm="HS256"),
    "not-a-jwt",
])
def test_bad_tokens_rejected(token):
    with pytest.raises(auth.HTTPException) as exc:
        auth.decode_token(token)
    assert exc.value.status_code == 401


# --- login -------------------------------------------------------------------

def test_login_success_returns_token_without_password_hash(users):
    res = client.post("/api/auth/login", json={"email": "  ANALYST@test.local ", "password": "Secret@123"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == "analyst"
    assert "password_hash" not in body["user"]
    assert auth.decode_token(body["token"])["email"] == "analyst@test.local"


@pytest.mark.parametrize("email, password", [("analyst@test.local", "wrong"), ("nobody@test.local", "Secret@123")])
def test_login_failure_is_uniform(users, email, password):
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"


def test_me_requires_token():
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=_bearer("analyst")).json()["role"] == "analyst"


# --- route guards (applied in api/index.py) ----------------------------------

@pytest.mark.parametrize("path", [
    "/api/report/",
    "/api/companies/search?q=acme",
    "/api/export/backup/all",
    "/api/pdf/status/some-report-id",
])
def test_protected_routes_reject_anonymous(path):
    assert client.get(path).status_code == 401


def test_flexible_guard_accepts_query_token_but_strict_guard_does_not(monkeypatch):
    import api.pdf as pdf

    async def _no_report(*_a, **_k):
        return None
    monkeypatch.setattr(pdf, "get_report", _no_report)
    token = auth.create_token(_user("analyst"))
    # pdf/export are opened as raw browser URLs, so ?token= is allowed there...
    assert client.get(f"/api/pdf/status/r1?token={token}").status_code != 401
    assert client.get("/api/pdf/status/r1").status_code == 401
    # ...but not on header-only routes.
    assert client.get(f"/api/report/?token={token}").status_code == 401


def test_full_db_backup_is_admin_only(monkeypatch):
    import database.crud as crud

    async def _no_reports(*_a, **_k):
        return []
    monkeypatch.setattr(crud, "get_all_reports", _no_reports)
    assert client.get("/api/export/backup/all", headers=_bearer("analyst")).status_code == 403
    assert client.get("/api/export/backup/all", headers=_bearer("admin")).status_code == 200
