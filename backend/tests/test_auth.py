"""Auth token-type separation (K1), live user re-check, seeding and login throttling."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api import auth
from api import portal

STAFF = {"id": "usr_100", "email": "analyst@valyze.test", "name": "Ana", "role": "analyst"}
ADMIN = {"id": "usr_101", "email": "admin@valyze.test", "name": "Adm", "role": "admin"}


@pytest.fixture(autouse=True)
def user_store(monkeypatch):
    """In-memory app_users table; tests mutate `rows` to delete/demote users."""
    rows = [
        {**STAFF, "password_hash": auth._hash("correct-horse")},
        {**ADMIN, "password_hash": auth._hash("admin-pass-123")},
    ]
    monkeypatch.setattr(auth, "_fetch_app_users", lambda: [dict(r) for r in rows])
    auth._invalidate_users_cache()
    auth.staff_login_throttle.reset()
    portal.portal_login_throttle.reset()
    yield rows
    auth._invalidate_users_cache()


def _app() -> FastAPI:
    app = FastAPI()
    app.include_router(auth.router)

    @app.get("/staff")
    def staff(user: dict = Depends(auth.get_current_user)):
        return user

    @app.get("/flex")
    def flex(user: dict = Depends(auth.get_current_user_flexible)):
        return user

    return app


@pytest.fixture
def client():
    return TestClient(_app())


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _link_token(user=STAFF, seconds=120):
    return jwt.encode(
        {**{k: user[k] for k in ("email", "name", "role")}, "sub": user["id"], "type": "link",
         "exp": datetime.now(timezone.utc) + timedelta(seconds=seconds)},
        auth.JWT_SECRET, algorithm=auth.JWT_ALGORITHM,
    )


# --- C-1: portal token must not pass staff auth -----------------------------

def test_portal_token_rejected_by_staff_header_guard(client):
    token = portal.create_portal_token("sess-1", "client-1")
    assert client.get("/staff", headers=_bearer(token)).status_code == 401
    assert client.get("/api/auth/me", headers=_bearer(token)).status_code == 401


def test_legacy_portal_token_without_aud_rejected_by_staff_guard(client):
    legacy = jwt.encode(
        {"session_id": "s", "client_id": "c", "type": "portal",
         "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        auth.JWT_SECRET, algorithm=auth.JWT_ALGORITHM,
    )
    assert client.get("/staff", headers=_bearer(legacy)).status_code == 401
    assert client.get("/flex", params={"token": legacy}).status_code == 401


def test_portal_token_rejected_by_flexible_guard(client):
    token = portal.create_portal_token("sess-1", "client-1")
    assert client.get("/flex", headers=_bearer(token)).status_code == 401
    assert client.get("/flex", params={"token": token}).status_code == 401


def test_token_without_sub_or_role_rejected(client):
    for claims in ({"email": "x@y", "role": "admin"}, {"sub": STAFF["id"], "email": "x@y"}):
        token = jwt.encode({**claims, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                           auth.JWT_SECRET, algorithm=auth.JWT_ALGORITHM)
        assert client.get("/staff", headers=_bearer(token)).status_code == 401


def test_portal_decoder_rejects_staff_and_link_tokens():
    with pytest.raises(Exception) as exc:
        portal.decode_portal_token(auth.create_token(STAFF))
    assert getattr(exc.value, "status_code", None) == 401
    with pytest.raises(Exception) as exc:
        portal.decode_portal_token(_link_token())
    assert getattr(exc.value, "status_code", None) == 401


def test_portal_token_has_audience_and_round_trips():
    token = portal.create_portal_token("sess-1", "client-1")
    assert jwt.decode(token, options={"verify_signature": False})["aud"] == "portal"
    assert portal.decode_portal_token(token)["session_id"] == "sess-1"


# --- link tokens ------------------------------------------------------------

def test_link_token_rejected_by_header_guard(client):
    assert client.get("/staff", headers=_bearer(_link_token())).status_code == 401
    assert client.get("/flex", headers=_bearer(_link_token())).status_code == 401


def test_link_token_accepted_via_query_by_flexible_guard(client):
    r = client.get("/flex", params={"token": _link_token()})
    assert r.status_code == 200
    assert r.json() == {"sub": STAFF["id"], "email": STAFF["email"], "name": STAFF["name"], "role": "analyst"}


def test_expired_link_token_rejected(client):
    assert client.get("/flex", params={"token": _link_token(seconds=-5)}).status_code == 401


def test_staff_token_rejected_via_query(client):
    staff = auth.create_token(STAFF)
    assert client.get("/flex", params={"token": staff}).status_code == 401
    # ...but accepted as a header on the same route.
    assert client.get("/flex", headers=_bearer(staff)).status_code == 200


def test_link_token_endpoint(client):
    staff = auth.create_token(STAFF)
    r = client.post("/api/auth/link-token", headers=_bearer(staff))
    assert r.status_code == 200
    body = r.json()
    assert body["expires_in"] == 120
    claims = jwt.decode(body["token"], auth.JWT_SECRET, algorithms=[auth.JWT_ALGORITHM])
    assert claims["type"] == "link" and claims["sub"] == STAFF["id"]
    assert claims["exp"] - datetime.now(timezone.utc).timestamp() <= 121
    assert client.get("/flex", params={"token": body["token"]}).status_code == 200


def test_link_token_endpoint_requires_staff_header(client):
    assert client.post("/api/auth/link-token").status_code == 401
    assert client.post("/api/auth/link-token", headers=_bearer(_link_token())).status_code == 401
    portal_token = portal.create_portal_token("s", "c")
    assert client.post("/api/auth/link-token", headers=_bearer(portal_token)).status_code == 401


# --- live user re-check -----------------------------------------------------

def test_deleted_user_rejected(client, user_store):
    token = auth.create_token(STAFF)
    assert client.get("/staff", headers=_bearer(token)).status_code == 200
    user_store[:] = [r for r in user_store if r["id"] != STAFF["id"]]
    auth._invalidate_users_cache()
    assert client.get("/staff", headers=_bearer(token)).status_code == 401
    assert client.get("/flex", params={"token": _link_token()}).status_code == 401


def test_role_comes_from_store_not_token(client, user_store):
    token = auth.create_token({**STAFF, "role": "super_admin"})
    assert client.get("/staff", headers=_bearer(token)).json()["role"] == "analyst"
    assert client.get("/api/auth/users", headers=_bearer(token)).status_code == 403


def test_prod_fails_closed_when_store_unreadable(client, monkeypatch):
    def boom():
        raise auth.UserStoreUnavailable("down")
    monkeypatch.setattr(auth, "_fetch_app_users", boom)
    monkeypatch.setattr(auth, "_IS_PROD", True)
    auth._invalidate_users_cache()
    r = client.post("/api/auth/login", json={"email": "superadmin@valyze.com", "password": "Superadmin@123"})
    assert r.status_code == 503
    assert client.get("/staff", headers=_bearer(auth.create_token(STAFF))).status_code == 503


def test_dev_fallback_uses_generated_not_hardcoded_passwords(client, monkeypatch):
    def boom():
        raise auth.UserStoreUnavailable("down")
    monkeypatch.setattr(auth, "_fetch_app_users", boom)
    monkeypatch.setattr(auth, "_IS_PROD", False)
    monkeypatch.setitem(auth._dev_seed_cache, "rows", None)
    auth._invalidate_users_cache()
    r = client.post("/api/auth/login", json={"email": "superadmin@valyze.com", "password": "Superadmin@123"})
    assert r.status_code == 401


# --- seeding ----------------------------------------------------------------

def test_seed_users_have_no_plaintext_passwords():
    assert all("password" not in seed for seed in auth.SEED_USERS)


def test_seed_passwords_from_env(monkeypatch):
    monkeypatch.setenv("SEED_PASSWORD_USR_000", "from-env-password-1")
    monkeypatch.setenv("VALYZE_SEED_PASSWORDS", '{"waleed@valyze.com": "from-json-password"}')
    rows, generated = auth._seed_rows()
    by_id = {r["id"]: r for r in rows}
    assert auth._verify("from-env-password-1", by_id["usr_000"]["password_hash"])
    assert auth._verify("from-json-password", by_id["usr_001"]["password_hash"])
    assert "superadmin@valyze.com" not in generated and "waleed@valyze.com" not in generated
    assert set(generated) == {s["email"] for s in auth.SEED_USERS} - {"superadmin@valyze.com", "waleed@valyze.com"}


def test_first_run_seeds_empty_table(monkeypatch):
    table: list = []
    monkeypatch.setattr(auth, "_fetch_app_users", lambda: list(table))
    import services.supabase_client as sb
    monkeypatch.setattr(sb, "bulk_insert_app_users", lambda rows: table.extend(rows) or True)
    auth._invalidate_users_cache()
    users = auth._load_users()
    assert set(users) == {s["email"] for s in auth.SEED_USERS}


# --- login throttling -------------------------------------------------------

def test_login_success(client):
    r = client.post("/api/auth/login", json={"email": STAFF["email"], "password": "correct-horse"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "analyst"


def test_login_throttled_per_account(client):
    for _ in range(auth.LOGIN_MAX_FAILURES_PER_ACCOUNT):
        r = client.post("/api/auth/login", json={"email": STAFF["email"], "password": "wrong"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": STAFF["email"], "password": "correct-horse"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    # A different account from the same client is not yet blocked.
    r = client.post("/api/auth/login", json={"email": ADMIN["email"], "password": "admin-pass-123"})
    assert r.status_code == 200


def test_login_throttled_per_ip(client, monkeypatch):
    monkeypatch.setattr(auth, "LOGIN_MAX_FAILURES_PER_IP", 3)
    for i in range(3):
        client.post("/api/auth/login", json={"email": f"nobody{i}@x.test", "password": "wrong"})
    r = client.post("/api/auth/login", json={"email": ADMIN["email"], "password": "admin-pass-123"})
    assert r.status_code == 429


# --- the real app -----------------------------------------------------------

@pytest.fixture
def index_client():
    from api.index import app
    return TestClient(app)


def test_index_staff_routes_reject_portal_token(index_client):
    token = portal.create_portal_token("sess-1", "client-1")
    for method, path in (("get", "/api/report/"), ("get", "/api/orders/"), ("get", "/api/clients/"),
                         ("post", "/api/proxy"), ("get", "/api/invoices/")):
        r = getattr(index_client, method)(path, headers=_bearer(token))
        assert r.status_code == 401, (path, r.status_code)


def test_index_pdf_rejects_staff_token_in_query(index_client):
    staff = auth.create_token(ADMIN)
    r = index_client.get("/api/pdf/status/some-id", params={"token": staff})
    assert r.status_code == 401


def test_ready_tables_admin_only(index_client, monkeypatch):
    import api.index as index
    assert index_client.get("/ready/tables").status_code == 401
    assert index_client.get("/ready/tables", headers=_bearer(auth.create_token(STAFF))).status_code == 403
    assert index_client.get("/ready/tables", params={"token": _link_token(ADMIN)}).status_code == 401
    monkeypatch.setattr(index, "_count_rows", lambda table: 7)
    r = index_client.get("/ready/tables", headers=_bearer(auth.create_token(ADMIN)))
    assert r.status_code == 200
    assert r.json()["tables"] == {"reports": 7, "clients": 7, "orders": 7, "invoices": 7}


def test_ready_storage_accepts_link_not_staff_query(index_client):
    assert index_client.get("/ready/storage", params={"token": auth.create_token(ADMIN)}).status_code == 401
    assert index_client.get("/ready/storage", params={"token": _link_token(STAFF)}).status_code == 403
