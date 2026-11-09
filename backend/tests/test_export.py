"""Export endpoints: non-ASCII filenames and XML element names."""

from __future__ import annotations

from xml.etree.ElementTree import fromstring

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.export as export_api
from api.auth import get_current_user
from models.report_schema import FieldData, build_empty_report


@pytest.fixture
def client(monkeypatch):
    report = build_empty_report("r1")
    report.fields["company_name"] = FieldData(value="شركة الاختبار", confidence="high")
    report.fields["1st_year"] = FieldData(value="2023", confidence="high")
    report.fields["net margin"] = FieldData(value="5\x01%", confidence="high")
    report.fields["xml_thing"] = FieldData(value="x", confidence="high")

    async def fake_get_report(db, report_id, strict=False):
        return report if report_id == "r1" else None

    monkeypatch.setattr(export_api, "get_report", fake_get_report)
    app = FastAPI()
    app.include_router(export_api.router)
    app.dependency_overrides[get_current_user] = lambda: {"sub": "u", "role": "analyst"}
    return TestClient(app)


def test_csv_with_arabic_company_name(client):
    r = client.post("/api/export/csv/r1")
    assert r.status_code == 200
    cd = r.headers["content-disposition"]
    assert "filename*=UTF-8''" in cd and cd.isascii()


def test_xml_tags_are_valid(client):
    r = client.post("/api/export/xml/r1")
    assert r.status_code == 200
    root = fromstring(r.content)  # parses -> every tag name is valid
    tags = {child.tag for child in root}
    assert {"_1st_year", "net_margin", "_xml_thing", "company_name"} <= tags
    assert root.find("net_margin").text == "5%"


def test_xml_tag_helper():
    assert export_api._xml_tag("ok_name") == "ok_name"
    assert export_api._xml_tag("-x") == "_-x"
    assert export_api._xml_tag("a/b c") == "a_b_c"


def test_invalid_id_and_missing_report(client):
    assert client.post("/api/export/json/bad%20id").status_code == 400
    assert client.post("/api/export/json/nope").status_code == 404


def test_backup_requires_admin(client):
    app = client.app
    app.dependency_overrides[export_api.get_current_user_flexible] = lambda: {"role": "analyst"}
    assert client.get("/api/export/backup/all").status_code == 403


def test_legacy_download_route_removed(client):
    assert client.get("/api/export/download/r1/pdf").status_code == 404
