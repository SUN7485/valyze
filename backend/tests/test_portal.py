"""Portal usage counting, portal login throttling, client-admin role checks,
and non-ASCII download filenames."""

import asyncio
from urllib.parse import unquote

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api import auth, portal
from api._http import content_disposition

ANALYST = {"id": "usr_200", "email": "an@valyze.test", "name": "An", "role": "analyst"}
ADMIN = {"id": "usr_201", "email": "ad@valyze.test", "name": "Ad", "role": "admin"}


@pytest.fixture(autouse=True)
def user_store(monkeypatch):
    rows = [{**ANALYST, "password_hash": "x"}, {**ADMIN, "password_hash": "x"}]
    monkeypatch.setattr(auth, "_fetch_app_users", lambda: [dict(r) for r in rows])
    auth._invalidate_users_cache()
    portal.portal_login_throttle.reset()
    yield
    auth._invalidate_users_cache()


@pytest.fixture
def client():
    from api.index import app
    return TestClient(app)


def _bearer(user):
    return {"Authorization": f"Bearer {auth.create_token(user)}"}


# --- Content-Disposition ----------------------------------------------------

@pytest.mark.parametrize("name", ["تقرير مالي.pdf", 'a"b\r\nX-Evil: 1.pdf', "plain.csv", ""])
def test_content_disposition_is_latin1_safe(name):
    value = content_disposition(name)
    value.encode("latin-1")
    assert "\r" not in value and "\n" not in value
    fallback = value.split('filename="', 1)[1].split('"', 1)[0]
    assert '"' not in fallback and "\\" not in fallback
    encoded = value.split("filename*=UTF-8''", 1)[1]
    assert unquote(encoded) == (name.replace("\r", "").replace("\n", "") or "download")


def test_download_arabic_filename(client, monkeypatch):
    import api.upload as upload
    import services.supabase_client as sb

    name = "تقرير.pdf"

    async def fake_report(*a, **k):
        return object()

    async def fake_files(*a, **k):
        return [{"filename": name, "file_path": "storage://portal-uploads/o/x.pdf"}]

    monkeypatch.setattr(upload, "get_report", fake_report)
    monkeypatch.setattr(upload, "get_uploaded_files", fake_files)
    monkeypatch.setattr(sb, "download_from_storage", lambda bucket, path: b"%PDF-1.4")

    listing = client.get("/api/upload/portal-files/r1", headers=_bearer(ANALYST))
    assert listing.status_code == 200
    path = listing.json()["files"][0]["download_path"]
    assert path.isascii()

    r = client.get(path, headers=_bearer(ANALYST))
    assert r.status_code == 200
    assert "filename*=UTF-8''" in r.headers["content-disposition"]
    assert r.content == b"%PDF-1.4"


# --- atomic usage counting --------------------------------------------------

class _Resp:
    def __init__(self, status, text):
        self.status_code = status
        self.text = text

    def json(self):
        import json
        return json.loads(self.text)


def test_usage_rpc_consumed(monkeypatch):
    monkeypatch.setattr(portal.requests, "post", lambda *a, **k: _Resp(200, "true"))
    asyncio.run(portal._increment_session_used_count("s1"))


def test_usage_rpc_limit_reached(monkeypatch):
    monkeypatch.setattr(portal.requests, "post", lambda *a, **k: _Resp(200, "false"))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(portal._increment_session_used_count("s1"))
    assert exc.value.status_code == 401


def test_usage_rpc_missing_falls_back(monkeypatch):
    monkeypatch.setattr(
        portal.requests, "post",
        lambda *a, **k: _Resp(404, '{"code":"PGRST202","message":"Could not find the function"}'),
    )
    writes = []

    async def fake_get(session_id):
        return {"id": session_id, "used_count": 2, "max_uses": 5}

    async def fake_update(session_id, data):
        writes.append(data)

    monkeypatch.setattr(portal, "_get_session", fake_get)
    monkeypatch.setattr(portal, "_update_session", fake_update)
    asyncio.run(portal._increment_session_used_count("s1"))
    assert writes == [{"used_count": 3}]


def test_usage_fallback_refuses_at_limit(monkeypatch):
    monkeypatch.setattr(portal.requests, "post", lambda *a, **k: _Resp(404, "{}"))

    async def fake_get(session_id):
        return {"id": session_id, "used_count": 5, "max_uses": 5}

    monkeypatch.setattr(portal, "_get_session", fake_get)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(portal._increment_session_used_count("s1"))
    assert exc.value.status_code == 401


# --- portal login throttle --------------------------------------------------

def test_portal_auth_throttled(client, monkeypatch):
    session = {
        "id": "s1", "client_id": "c1", "no_expiry": True, "used_count": 0, "max_uses": None,
        "password_hash": auth._hash("right-password"),
    }

    async def fake_by_token(token):
        return session

    monkeypatch.setattr(portal, "_get_session_by_token", fake_by_token)
    for _ in range(auth.LOGIN_MAX_FAILURES_PER_ACCOUNT):
        r = client.post("/api/portal/auth", json={"token": "tok", "password": "nope"})
        assert r.status_code == 401
    r = client.post("/api/portal/auth", json={"token": "tok", "password": "right-password"})
    assert r.status_code == 429


# --- clients: K6 roles, K7 no plaintext persisted ---------------------------

def _patch_clients(monkeypatch, update_ok=True, session_exists=True):
    import api.clients as clients
    import services.supabase_client as sb

    created = []
    monkeypatch.setattr(clients, "get_client_record", lambda cid: {"id": cid, "client_name": "C"})
    monkeypatch.setattr(clients, "create_client_session_record",
                        lambda data: created.append(data) or {**data, "id": "s-new"})
    monkeypatch.setattr(sb, "get_session", lambda sid: {"id": sid} if session_exists else None)
    monkeypatch.setattr(sb, "update_session", lambda sid, data: update_ok)
    monkeypatch.setattr(clients, "delete_session_record", lambda sid: True)
    return created


@pytest.mark.parametrize("method,path", [
    ("post", "/api/clients/c1/generate-portal-link"),
    ("post", "/api/clients/sessions/s1/reset-password"),
    ("post", "/api/clients/sessions/s1/toggle-disable"),
    ("post", "/api/clients/sessions/s1/set-no-expiry"),
    ("delete", "/api/clients/sessions/s1"),
    ("delete", "/api/clients/c1"),
])
def test_client_admin_actions_forbidden_for_analyst(client, monkeypatch, method, path):
    _patch_clients(monkeypatch)
    kwargs = {"json": {}} if method == "post" else {}
    r = getattr(client, method)(path, headers=_bearer(ANALYST), **kwargs)
    assert r.status_code == 403


def test_generate_portal_link_does_not_persist_plaintext(client, monkeypatch):
    created = _patch_clients(monkeypatch)
    r = client.post("/api/clients/c1/generate-portal-link", json={}, headers=_bearer(ADMIN))
    assert r.status_code == 200
    password = r.json()["password_plain"]
    assert password
    assert all(password not in str(v) for v in created[0].values())
    assert not created[0].get("password_plain_temp")


def test_reset_password_reports_failed_update(client, monkeypatch):
    _patch_clients(monkeypatch, update_ok=False)
    r = client.post("/api/clients/sessions/s1/reset-password", headers=_bearer(ADMIN))
    assert r.status_code == 500
    assert "new_password" not in r.text


def test_session_actions_404_when_missing(client, monkeypatch):
    _patch_clients(monkeypatch, session_exists=False)
    for method, path in (("post", "/api/clients/sessions/s1/reset-password"),
                         ("post", "/api/clients/sessions/s1/toggle-disable"),
                         ("delete", "/api/clients/sessions/s1")):
        kwargs = {"json": {}} if method == "post" else {}
        assert getattr(client, method)(path, headers=_bearer(ADMIN), **kwargs).status_code == 404
