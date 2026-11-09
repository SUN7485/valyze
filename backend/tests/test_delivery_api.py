"""Delivery API: QA verdict roles, the send path, and KPI counting (no network)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import auth, delivery

ADMIN = {"sub": "usr_001", "email": "waleed@valyze.com", "name": "Waleed", "role": "admin"}
ANALYST = {"sub": "usr_002", "email": "mohamed@valyze.com", "name": "Mohamed", "role": "analyst"}
REVIEWER = {"sub": "usr_006", "email": "rita@valyze.com", "name": "Rita", "role": "reviewer"}


def _client(user):
    app = FastAPI()
    app.include_router(delivery.router)
    app.dependency_overrides[auth.get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def report(monkeypatch):
    row = {"id": "r1", "company_name": "ACME\r\nBcc: evil@x.com", "analyst": "mohamed@valyze.com",
           "qa_verdict": "pass", "delivered_at": None}
    patches = []
    monkeypatch.setattr(delivery, "_slim_report", lambda report_id, with_qa=True: dict(row) if report_id == "r1" else None)
    monkeypatch.setattr(delivery, "_report_authors", lambda report_id, r: ["mohamed@valyze.com"])

    def fake_patch(report_id, payload):
        patches.append(payload)
        return True

    monkeypatch.setattr(delivery, "_patch_report", fake_patch)
    return {"row": row, "patches": patches}


# ---------------------------------------------------------------------------
# QA verdict
# ---------------------------------------------------------------------------

def test_analyst_cannot_record_qa_verdict(report):
    r = _client(ANALYST).patch("/api/delivery/qa/r1", json={"verdict": "pass"})
    assert r.status_code == 403
    assert not report["patches"]


def test_author_cannot_verify_own_report(report):
    author_admin = {**ADMIN, "email": "Mohamed@valyze.com"}
    r = _client(author_admin).patch("/api/delivery/qa/r1", json={"verdict": "pass"})
    assert r.status_code == 403


def test_reviewer_verdict_is_saved_with_reviewer(report):
    r = _client(REVIEWER).patch("/api/delivery/qa/r1", json={"verdict": "fail", "finding_count": 2})
    assert r.status_code == 200
    assert r.json() == {"saved": True, "verdict": "fail"}
    assert report["patches"][0]["qa_checked_by"] == "rita@valyze.com"


def test_unknown_report_404(report):
    assert _client(REVIEWER).patch("/api/delivery/qa/nope", json={"verdict": "pass"}).status_code == 404


# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------

@pytest.fixture
def sendable(monkeypatch, report):
    sent = []
    monkeypatch.setattr(delivery, "SEND_ENABLED", True)
    monkeypatch.setattr(delivery, "configured_transport", lambda: "resend")
    monkeypatch.setattr(delivery, "_order_for_report", lambda report_id, order_id=None: (
        "o1", {"order_number": "ORD-2026-0001"}, {"client_name": "Client", "email": "client@example.com"}))

    async def fake_render(report_id):
        return b"<html>" + b"x" * 200 + b"</html>"

    monkeypatch.setattr(delivery, "_rendered_report_html", fake_render)

    def fake_send(to, subject, html, attachments=None):
        sent.append({"to": to, "subject": subject, "html": html, "attachments": attachments})
        return "resend"

    monkeypatch.setattr(delivery, "send_email", fake_send)
    return {**report, "sent": sent}


def test_send_attaches_report_and_strips_header_newlines(sendable):
    r = _client(ADMIN).post("/api/delivery/r1/send")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent"] is True and body["attached_as"] == "html" and body["marked_delivered"] is True
    mail = sendable["sent"][0]
    assert "\r" not in mail["subject"] and "\n" not in mail["subject"]
    name, blob = mail["attachments"][0]
    assert name.endswith(".html") and blob.startswith(b"<html>")
    assert "attached as an HTML document" in mail["html"]
    assert "delivered_at" in sendable["patches"][0]


def test_send_with_uploaded_pdf(sendable):
    r = _client(ADMIN).post("/api/delivery/r1/send", files={"pdf": ("r.pdf", b"%PDF-1.7 test", "application/pdf")})
    assert r.status_code == 200, r.text
    assert r.json()["attached_as"] == "pdf"
    name, blob = sendable["sent"][0]["attachments"][0]
    assert name.endswith(".pdf") and blob.startswith(b"%PDF")


def test_send_refuses_non_pdf_upload(sendable):
    r = _client(ADMIN).post("/api/delivery/r1/send", files={"pdf": ("r.pdf", b"hello", "application/pdf")})
    assert r.status_code == 400
    assert not sendable["sent"]


def test_second_send_is_refused_unless_resend(sendable):
    sendable["row"]["delivered_at"] = "2026-11-01T00:00:00+00:00"
    c = _client(ADMIN)
    assert c.post("/api/delivery/r1/send").status_code == 409
    assert not sendable["sent"]
    r = c.post("/api/delivery/r1/send", params={"resend": "true"})
    assert r.status_code == 200
    assert r.json()["resent"] is True


def test_failed_send_is_not_marked_delivered(sendable, monkeypatch):
    def failing(*a, **k):
        raise RuntimeError("The email provider rejected the message.")

    monkeypatch.setattr(delivery, "send_email", failing)
    r = _client(ADMIN).post("/api/delivery/r1/send")
    assert r.status_code == 502
    assert not sendable["patches"]


def test_unrenderable_report_is_not_sent(sendable, monkeypatch):
    async def none(report_id):
        return None

    monkeypatch.setattr(delivery, "_rendered_report_html", none)
    assert _client(ADMIN).post("/api/delivery/r1/send").status_code == 422
    assert not sendable["sent"] and not sendable["patches"]


def test_header_safe_strips_control_characters():
    assert delivery._header_safe("A\r\nB\tC") == "A B C"


# ---------------------------------------------------------------------------
# KPI
# ---------------------------------------------------------------------------

def test_kpi_counts_complete_and_completed(monkeypatch):
    class Resp:
        status_code = 200
        headers = {}

        def raise_for_status(self):
            pass

        def json(self):
            return [
                {"id": "1", "analyst": "a", "status": "complete"},
                {"id": "2", "analyst": "a", "status": "completed"},
                {"id": "3", "analyst": "a", "status": "draft"},
            ]

    monkeypatch.setattr(delivery.requests, "get", lambda *a, **k: Resp())
    r = _client(ADMIN).get("/api/delivery/kpi")
    assert r.status_code == 200
    assert r.json()["team"]["completed"] == 2
