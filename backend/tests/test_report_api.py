"""Report editor / import / delete / list endpoints against an in-memory PostgREST fake.

No network: services.report_queries._request and database.crud.sb_get_report are
replaced by a tiny emulation of the PostgREST behaviour the code relies on
(eq filters, the report_json->>updated_at compare-and-set, select=, count).
"""

from __future__ import annotations

import copy
import json
from urllib.parse import parse_qsl, urlsplit

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.report as report_api
import database.crud as crud
import services.report_queries as rq
from api.auth import get_current_user
from models.field_meta import ARRAY_FIELDS, is_known_field
from models.report_schema import FieldData, FullReport, ReportArrays, build_empty_report

RID = "rep-1"
T0 = "2026-01-01T00:00:00.000001+00:00"


class FakeResponse:
    def __init__(self, status_code=200, body=None, headers=None):
        self.status_code = status_code
        self.text = "" if body is None else json.dumps(body)
        self._body = body
        self.headers = headers or {}

    def json(self):
        return self._body


class FakePostgrest:
    def __init__(self):
        self.reports = {}
        self.uploaded_files = []
        self.order_companies = []
        self.calls = []
        self.before_patch = None  # hook to simulate a concurrent writer

    def add_report(self, report: FullReport, as_string=False):
        rj = report.model_dump()
        self.reports[report.report_id] = {
            "id": report.report_id,
            "status": report.status,
            "report_json": json.dumps(rj) if as_string else rj,
        }

    def report(self, rid=RID) -> FullReport:
        rj = self.reports[rid]["report_json"]
        return FullReport.model_validate(json.loads(rj) if isinstance(rj, str) else rj)

    # database.crud.sb_get_report replacement
    def get_report(self, rid):
        row = self.reports.get(rid)
        return copy.deepcopy(row) if row else None

    # services.report_queries._request replacement
    def request(self, method, url, **kwargs):
        parts = urlsplit(url)
        table = parts.path.rsplit("/", 1)[-1]
        params = parse_qsl(parts.query, keep_blank_values=True)
        self.calls.append((method, table, params, kwargs.get("json")))
        filters = {k: v for k, v in params if k not in ("select", "order", "limit", "offset", "or")}

        if table == "reports" and method == "PATCH":
            if self.before_patch:
                hook, self.before_patch = self.before_patch, None
                hook()
            rid = filters["id"][len("eq."):]
            row = self.reports.get(rid)
            if row is None:
                return FakeResponse(200, [])
            expected = filters.get("report_json->>updated_at")
            if expected is not None:
                rj = row["report_json"]
                current = rj.get("updated_at") if isinstance(rj, dict) else None
                if current != expected[len("eq."):]:
                    return FakeResponse(200, [])
            body = kwargs["json"]
            row["report_json"] = copy.deepcopy(body["report_json"])
            row["status"] = body.get("status")
            return FakeResponse(200, [{"id": rid}])

        if table == "reports" and method == "GET":
            rows = list(self.reports.values())
            if "id" in filters:
                rows = [r for r in rows if r["id"] == filters["id"][len("eq."):]]
            out = []
            for r in rows:
                rj = r["report_json"] if isinstance(r["report_json"], dict) else {}
                out.append({"id": r["id"], "json_updated_at": rj.get("updated_at"),
                            "updated_at": rj.get("updated_at"), "status": r.get("status")})
            return FakeResponse(200, out, {"content-range": f"0-{len(out) - 1}/{len(out)}"})

        if table == "reports" and method == "DELETE":
            rid = filters["id"][len("eq."):]
            if any(oc.get("report_id") == rid for oc in self.order_companies):
                return FakeResponse(409, {"code": "23503", "message": "fk"})
            row = self.reports.pop(rid, None)
            return FakeResponse(200, [{"id": rid}] if row else [])

        if table == "uploaded_files" and method == "DELETE":
            rid = filters["report_id"][len("eq."):]
            self.uploaded_files = [f for f in self.uploaded_files if f["report_id"] != rid]
            return FakeResponse(204)

        if table == "order_companies" and method == "GET":
            rid = filters["report_id"][len("eq."):]
            return FakeResponse(200, [oc for oc in self.order_companies if oc["report_id"] == rid])

        raise AssertionError(f"unexpected call {method} {url}")

    def patches(self):
        return [c for c in self.calls if c[0] == "PATCH"]


@pytest.fixture
def db(monkeypatch):
    fake = FakePostgrest()
    monkeypatch.setattr(rq, "_request", fake.request)
    monkeypatch.setattr(crud, "sb_get_report", fake.get_report)
    report = build_empty_report(RID)
    report.updated_at = T0
    fake.add_report(report)
    return fake


@pytest.fixture
def user():
    return {"sub": "u1", "email": "a@x", "name": "A", "role": "analyst"}


@pytest.fixture
def client(db, user):
    app = FastAPI()
    app.include_router(report_api.router)
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


# ---------------------------------------------------------------------------
# K3: ARRAY_FIELDS / schema
# ---------------------------------------------------------------------------


def test_array_fields_include_editor_arrays():
    for name in ("board_members", "extra_reg_fields", "hidden_fields"):
        assert name in ARRAY_FIELDS
        assert name in ReportArrays.model_fields


def test_hidden_fields_survive_validation():
    arrays = ReportArrays.model_validate({"hidden_fields": ["capital", "fax"]})
    assert arrays.hidden_fields == ["capital", "fax"]


def test_is_known_field():
    assert is_known_field("company_name")
    assert is_known_field("roa_prev") and is_known_field("revenue_2")
    assert is_known_field("sector_risks") and is_known_field("exclude_page_4")
    assert not is_known_field("totally_made_up")
    assert not is_known_field("hidden_fields")


@pytest.mark.parametrize("name", ["board_members", "extra_reg_fields", "hidden_fields"])
def test_array_endpoint_accepts_editor_arrays(client, db, name):
    data = ["capital"] if name == "hidden_fields" else [{"name": "x", "value": "y"}]
    r = client.patch(f"/api/report/{RID}/array", json={"array_name": name, "data": data})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["items_count"] == 1
    assert body["updated_at"] != T0  # /array bumps updated_at
    assert getattr(db.report().arrays, name) == data
    assert db.report().updated_at == body["updated_at"]


def test_array_validation_error_does_not_leak(client):
    r = client.patch(
        f"/api/report/{RID}/array",
        json={"array_name": "shareholders", "data": [{"no_name": 1}]},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid items for array 'shareholders'"


# ---------------------------------------------------------------------------
# K2: optimistic locking
# ---------------------------------------------------------------------------


def test_field_edit_returns_new_updated_at_and_is_conditional(client, db):
    r = client.patch(
        f"/api/report/{RID}/field",
        json={"field_name": "company_name", "value": "Acme", "last_known_updated_at": T0},
    )
    assert r.status_code == 200, r.text
    assert r.json()["updated_at"] != T0
    (method, table, params, _), = db.patches()
    assert ("report_json->>updated_at", f"eq.{T0}") in params  # atomic compare-and-set
    assert db.report().fields["company_name"].value == "Acme"


def test_stale_last_known_updated_at_is_409(client, db):
    r = client.patch(
        f"/api/report/{RID}/field",
        json={"field_name": "company_name", "value": "Acme",
              "last_known_updated_at": "2020-01-01T00:00:00+00:00"},
    )
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["error"] == "conflict" and detail["current_updated_at"] == T0
    assert db.patches() == []


def test_concurrent_write_between_read_and_write_is_409(client, db):
    def other_writer():
        rj = db.reports[RID]["report_json"]
        rj["updated_at"] = "2026-01-01T00:00:05+00:00"
        rj["fields"]["company_name"]["value"] = "Theirs"

    db.before_patch = other_writer
    r = client.patch(
        f"/api/report/{RID}/fields",
        json={"fields": {"company_name": "Mine"}, "last_known_updated_at": T0},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["current_updated_at"] == "2026-01-01T00:00:05+00:00"
    assert db.report().fields["company_name"].value == "Theirs"  # not overwritten


def test_concurrent_write_without_version_is_merged(client, db):
    def other_writer():
        rj = db.reports[RID]["report_json"]
        rj["updated_at"] = "2026-01-01T00:00:05+00:00"
        rj["fields"]["capital"]["value"] = "1M"

    db.before_patch = other_writer
    r = client.patch(f"/api/report/{RID}/field", json={"field_name": "fax", "value": "123"})
    assert r.status_code == 200, r.text
    saved = db.report()
    assert saved.fields["fax"].value == "123" and saved.fields["capital"].value == "1M"
    assert len(db.patches()) == 2  # first CAS lost, retried on the fresh copy


def test_array_edit_honours_last_known_updated_at(client):
    r = client.patch(
        f"/api/report/{RID}/array",
        json={"array_name": "strengths", "data": ["x"], "last_known_updated_at": "stale"},
    )
    assert r.status_code == 409


def test_unknown_field_is_400(client, db):
    r = client.patch(f"/api/report/{RID}/field", json={"field_name": "nope_field", "value": 1})
    assert r.status_code == 400
    r = client.patch(f"/api/report/{RID}/fields", json={"fields": {"fax": "1", "bogus_x": 2}})
    assert r.status_code == 400 and "bogus_x" in r.json()["detail"]
    assert db.patches() == []


def test_bulk_counts_applied_keys(client):
    r = client.patch(
        f"/api/report/{RID}/fields",
        json={"fields": {"fax": "1", "roa_prev": "2", "sector_risks": "r"}},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["updated_count"] == 3
    assert sorted(body["fields"]) == ["fax", "roa_prev", "sector_risks"]
    assert "updated_at" in body


def test_locked_field_is_400(client, db):
    report = db.report()
    report.fields["capital"].locked = True
    db.add_report(report)
    r = client.patch(f"/api/report/{RID}/field", json={"field_name": "capital", "value": "x"})
    assert r.status_code == 400


def test_get_exposes_updated_at(client):
    r = client.get(f"/api/report/{RID}")
    assert r.status_code == 200 and r.json()["updated_at"] == T0


# ---------------------------------------------------------------------------
# Invalid report_json: 422 on read, delete still works
# ---------------------------------------------------------------------------


def test_invalid_report_json_is_422_not_404(client, db, user):
    db.reports["broken"] = {"id": "broken", "status": "ready", "report_json": {}}
    assert client.get("/api/report/broken").status_code == 422
    assert client.get("/api/report/missing").status_code == 404
    user["role"] = "admin"
    assert client.delete("/api/report/broken").status_code == 200
    assert "broken" not in db.reports


def test_legacy_string_report_json_still_editable(client, db):
    report = build_empty_report("legacy")
    report.updated_at = T0
    db.add_report(report, as_string=True)
    r = client.patch("/api/report/legacy/field", json={"field_name": "fax", "value": "9"})
    assert r.status_code == 200, r.text
    (_, _, params, _), = db.patches()
    assert not any(k == "report_json->>updated_at" for k, _ in params)


# ---------------------------------------------------------------------------
# Import (easy-way)
# ---------------------------------------------------------------------------


def test_import_country_object_and_swot_dicts(client, db):
    payload = {
        "company_identity": {"country": {"value": "United Arab Emirates"}, "company_name": "Acme"},
        "swot_analysis": {
            "strengths": [{"point": "Strong brand", "detail": "x"}, "Strong brand", "Cash"],
            "weaknesses": [{"title": "Debt"}],
        },
        "threats": ["FX"],
        "key_competitors": [{"name": "Rival"}],
        "made_up_scalar": "zzz",
    }
    r = client.post(f"/api/report/{RID}/easy-way", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    saved = db.report()
    assert saved.arrays.strengths == ["Strong brand", "Cash"]
    assert saved.arrays.weaknesses == ["Debt"]
    assert saved.arrays.threats == ["FX"]
    assert saved.fields["show_uae_fields"].value is True
    assert saved.fields["currency"].value == "AED"
    assert "made_up_scalar" not in saved.fields
    assert {"key_competitors", "made_up_scalar"} <= set(body["ignored_keys"])
    assert saved.status == "ready" and body["status"] == "ready"
    assert body["updated_at"] == saved.updated_at
    assert len(db.patches()) == 1  # one atomic write, status included


def test_import_keeps_in_progress_for_open_order_company(client, db):
    db.order_companies.append({"id": "oc1", "report_id": RID, "status": "in_progress"})
    r = client.post(f"/api/report/{RID}/easy-way", json={"company_name": "Acme"})
    assert r.status_code == 200, r.text
    assert db.report().status == "in_progress"
    oc_calls = [c for c in db.calls if c[1] == "order_companies"]
    assert oc_calls and ("report_id", f"eq.{RID}") in oc_calls[0][2]


def test_import_ready_when_order_company_completed(client, db):
    db.order_companies.append({"id": "oc1", "report_id": RID, "status": "completed"})
    client.post(f"/api/report/{RID}/easy-way", json={"company_name": "Acme"})
    assert db.report().status == "ready"


# ---------------------------------------------------------------------------
# Status + delete
# ---------------------------------------------------------------------------


def test_status_whitelist_and_404(client, db):
    assert client.patch(f"/api/report/{RID}/status", json={"status": "bogus"}).status_code == 400
    r = client.patch(f"/api/report/{RID}/status", json={"status": "complete"})
    assert r.status_code == 200 and db.report().status == "complete"
    assert client.patch("/api/report/missing/status", json={"status": "ready"}).status_code == 404


def test_delete_requires_admin(client, db, user):
    assert client.delete(f"/api/report/{RID}").status_code == 403
    assert RID in db.reports


def test_delete_admin_removes_files_and_404s_when_missing(client, db, user):
    user["role"] = "super_admin"
    db.uploaded_files = [{"report_id": RID, "filename": "a.pdf"}, {"report_id": "other"}]
    r = client.delete(f"/api/report/{RID}")
    assert r.status_code == 200 and r.json() == {"deleted": True, "report_id": RID}
    assert RID not in db.reports
    assert db.uploaded_files == [{"report_id": "other"}]
    assert client.delete(f"/api/report/{RID}").status_code == 404
    assert client.delete("/api/report/bad%20id").status_code == 400


def test_delete_linked_report_is_409(client, db, user):
    user["role"] = "admin"
    db.order_companies.append({"id": "oc1", "report_id": RID, "status": "in_progress"})
    assert client.delete(f"/api/report/{RID}").status_code == 409


def test_cloud_and_search_delete_share_rules(db, user):
    import api.cloud as cloud_api
    import api.search as search_api

    app = FastAPI()
    app.include_router(cloud_api.router)
    app.include_router(search_api.router)
    app.dependency_overrides[get_current_user] = lambda: user
    c = TestClient(app)
    assert c.delete(f"/api/cloud/{RID}").status_code == 403
    assert c.delete(f"/api/search/local/{RID}").status_code == 403
    user["role"] = "admin"
    assert c.delete(f"/api/search/local/{RID}").status_code == 200
    assert c.delete(f"/api/cloud/{RID}").status_code == 404


def test_cloud_save_is_honest(db, user):
    import api.cloud as cloud_api

    app = FastAPI()
    app.include_router(cloud_api.router)
    c = TestClient(app)
    body = c.post(f"/api/cloud/save/{RID}").json()
    assert body["saved"] is False and body["updated_at"] == T0
    assert c.post("/api/cloud/save/missing").status_code == 404


# ---------------------------------------------------------------------------
# Search paging pushed into PostgREST
# ---------------------------------------------------------------------------


def test_list_reports_page_encoding_and_count(monkeypatch):
    seen = {}

    def fake(method, url, **kwargs):
        seen["url"] = url
        seen["headers"] = kwargs.get("headers")
        return FakeResponse(200, [{"id": "a"}], {"content-range": "40-40/1234"})

    monkeypatch.setattr(rq, "_request", fake)
    rows, total = rq.list_reports_page(offset=40, limit=5000, search="شركة الف", country="UAE")
    assert total == 1234 and rows == [{"id": "a"}]
    params = dict(parse_qsl(urlsplit(seen["url"]).query))
    assert params["or"] == '(company_name.ilike."*شركة الف*",cr_number.ilike."*شركة الف*")'
    assert params["country"] == "eq.UAE"
    assert params["limit"] == str(rq.MAX_PAGE_SIZE) and params["offset"] == "40"
    assert "%25" not in seen["url"] and "+" not in seen["url"]  # encoded once
    assert seen["headers"]["Prefer"] == "count=exact"


def test_search_all_shape(db, user):
    import api.search as search_api

    app = FastAPI()
    app.include_router(search_api.router)
    c = TestClient(app)
    body = c.get("/api/search/all?skip=0&limit=10").json()
    assert set(body) == {"total", "skip", "limit", "reports"}
    assert body["total"] == 1 and body["reports"][0]["location"] == "cloud"
