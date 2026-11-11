"""The Vercel entry point must load every router.

api/index.py registers routers through _safe_register, which swallows import
errors so one broken module can't take the whole API down in production. The
flip side is that a broken router silently disappears; this test is what
turns that into a CI failure instead.
"""

def test_every_router_registers():
    from api.index import _registered

    failed = {name: status for name, status in _registered.items() if status != "OK"}
    assert not failed, f"routers failed to register: {failed}"
    assert len(_registered) >= 14


def test_health_endpoint():
    from fastapi.testclient import TestClient
    from api.index import app

    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
