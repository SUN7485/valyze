"""Tests for services/supabase_client.py query building and write semantics,
and services/company_intel.py matching. No network: requests is stubbed."""

from __future__ import annotations

import json
from urllib.parse import parse_qsl, urlsplit

import pytest
import requests

from services import company_intel
from services import supabase_client as sc


class FakeResponse:
    def __init__(self, status_code=200, body=None, headers=None):
        self.status_code = status_code
        self._body = body
        self.text = "" if body is None else json.dumps(body)
        self.headers = headers or {}

    def json(self):
        return self._body


@pytest.fixture
def captured(monkeypatch):
    """Record every URL passed to requests.get and answer with `responses`."""
    calls = {"urls": [], "responses": []}

    def fake_get(url, *args, **kwargs):
        calls["urls"].append(url)
        if calls["responses"]:
            return calls["responses"].pop(0)
        return FakeResponse(200, [])

    monkeypatch.setattr(sc.requests, "get", fake_get)
    return calls


def _prepared_query(url: str):
    """What `requests` actually sends, decoded exactly once."""
    prepared = requests.Request("GET", url).prepare().url
    # The URL we build must already be final — requests must not re-escape it.
    assert prepared == url
    assert "%25" not in prepared, "a value was double-encoded"
    return dict(parse_qsl(urlsplit(prepared).query, keep_blank_values=True))


# ---------------------------------------------------------------------------
# Search encoding
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("term", ["zz top", "شركة الأمل للتجارة"])
def test_search_reports_free_text_is_single_encoded(captured, term):
    sc.search_reports(query=term)
    params = _prepared_query(captured["urls"][0])
    assert params["or"] == (
        f'(company_name.ilike."*{term}*",legal_name.ilike."*{term}*",'
        f'cr_number.ilike."*{term}*",client_reference.ilike."*{term}*")'
    )


@pytest.mark.parametrize("term", ["zz top", "مؤسسة النور"])
def test_search_reports_named_filter_uses_star_wildcard(captured, term):
    sc.search_reports(company_name=term, country="Saudi Arabia")
    params = _prepared_query(captured["urls"][0])
    assert params["company_name"] == f"ilike.*{term}*"
    assert params["country"] == "ilike.*Saudi Arabia*"


def test_search_value_with_quotes_and_commas_is_escaped_inside_or(captured):
    sc.search_reports(query='A, "B" (C)\\D')
    params = _prepared_query(captured["urls"][0])
    assert 'company_name.ilike."*A, \\"B\\" (C)\\\\D*"' in params["or"]


@pytest.mark.parametrize("term", ["zz top", "عميل تجريبي"])
def test_get_all_clients_search_is_single_encoded(captured, term):
    sc.get_all_clients(search=term)
    params = _prepared_query(captured["urls"][0])
    assert params["or"] == (
        f'(client_name.ilike."*{term}*",valyze_id.ilike."*{term}*",email.ilike."*{term}*")'
    )


def test_company_intel_order_search_ors_name_and_cr(captured):
    company_intel._search_order_companies(company_name="زز توب", registration_no="1010 22")
    params = _prepared_query(captured["urls"][0])
    assert params["or"] == '(company_name.ilike."*زز توب*",registration_no.ilike."*1010 22*")'
    assert "company_name" not in params and "registration_no" not in params


def test_ids_are_encoded(captured):
    sc.get_report("a&b=c")
    url = captured["urls"][0]
    assert url.endswith("/reports?id=eq.a%26b%3Dc")


# ---------------------------------------------------------------------------
# Workload
# ---------------------------------------------------------------------------

def test_analyst_workload_counts_rows_in_python(captured):
    captured["responses"].append(FakeResponse(200, [
        {"auto_assigned_analyst": "a@x.com"},
        {"auto_assigned_analyst": "B@x.com"},
        {"auto_assigned_analyst": "a@x.com"},
        {"auto_assigned_analyst": "b@x.com"},
        {"auto_assigned_analyst": "a@x.com"},
        {"auto_assigned_analyst": None},
    ]))
    rows = sc.get_analyst_workload()
    assert rows == [
        {"auto_assigned_analyst": "a@x.com", "count": 3},
        {"auto_assigned_analyst": "b@x.com", "count": 2},
    ]
    params = _prepared_query(captured["urls"][0])
    assert params["select"] == "auto_assigned_analyst"
    assert params["status"] == "in.(pending,in_progress)"
    assert "group" not in params


def test_assign_analyst_picks_least_loaded(monkeypatch):
    from api import orders

    monkeypatch.setattr(orders, "get_order_assignable_users", lambda: ["a@x.com", "b@x.com", "c@x.com"])
    monkeypatch.setattr(orders, "sb_get_analyst_workload", lambda: [
        {"auto_assigned_analyst": "a@x.com", "count": 3},
        {"auto_assigned_analyst": "C@X.com", "count": 1},
        {"auto_assigned_analyst": "b@x.com", "count": 2},
    ])
    assert orders.assign_analyst() == "c@x.com"


# ---------------------------------------------------------------------------
# Writes that match zero rows
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("fn", [sc.delete_client, sc.delete_session, sc.delete_order, sc.delete_order_company, sc.delete_report])
def test_delete_of_missing_row_is_not_success(monkeypatch, fn):
    monkeypatch.setattr(sc.requests, "delete", lambda *a, **k: FakeResponse(200, []))
    assert fn("missing") is False
    monkeypatch.setattr(sc.requests, "delete", lambda *a, **k: FakeResponse(200, [{"id": "x"}]))
    assert fn("x") is True


def test_updates_of_missing_row_return_none(monkeypatch):
    monkeypatch.setattr(sc.requests, "patch", lambda *a, **k: FakeResponse(200, []))
    assert sc.update_client("missing", {"client_name": "x"}) is None
    assert sc.update_invoice("missing", {"status": "paid"}) is None
    assert sc.update_session("missing", {"disabled": True}) is False
    assert sc.update_order_company("missing", {"status": "x"}) is None


# ---------------------------------------------------------------------------
# Invoice numbering
# ---------------------------------------------------------------------------

def test_max_invoice_number_is_numeric_not_lexicographic(captured):
    captured["responses"].append(FakeResponse(200, [
        {"invoice_number": "INV-2026-9999"},
        {"invoice_number": "INV-2026-10000"},
        {"invoice_number": "INV-2026-0002"},
        {"invoice_number": "INV-2026-junk"},
    ]))
    assert sc.get_max_invoice_number(2026) == 10000
    params = _prepared_query(captured["urls"][0])
    assert params["invoice_number"] == "like.INV-2026-*"


# ---------------------------------------------------------------------------
# Company intel identity
# ---------------------------------------------------------------------------

def test_normalizer_keeps_distinguishing_words():
    n = company_intel.normalize_company_name
    assert n("ACME Trading L.L.C.") == n("acme trading co") == "acme trading"
    assert n("ACME Trading LLC") != n("ACME Holding LLC")
    assert company_intel.canonical_key("X Trading", None, "UAE") != company_intel.canonical_key("X Holding", None, "UAE")


def test_distinctive_token_wildcards_folded_arabic_letters():
    assert company_intel.distinctive_token("Al Noor International Trading Co") == "noor"
    # ة / ى / أ fold together, so the prefilter matches any spelling of them.
    assert company_intel.distinctive_token("مؤسسة") == "م_سس_"


def test_dossier_prefilters_on_token_and_cr_then_matches(monkeypatch):
    seen = {}

    def fake_search_reports(**kwargs):
        seen.setdefault("reports", []).append(kwargs)
        if kwargs.get("company_name"):
            return [
                {"id": "r1", "company_name": "ACME Trading L.L.C.", "country": "UAE"},
                {"id": "r2", "company_name": "ACME Holding", "country": "UAE"},
            ]
        return []

    def fake_orders(**kwargs):
        seen["orders"] = kwargs
        return []

    monkeypatch.setattr(company_intel, "search_reports", fake_search_reports)
    monkeypatch.setattr(company_intel, "_search_order_companies", fake_orders)
    dossier = company_intel.find_company_dossier(company_name="acme trading co", country="UAE")
    assert [r["company_name"] for r in seen["reports"]] == ["acme"]
    assert seen["orders"]["company_name"] == "acme"
    assert dossier["matched"] is True
    assert [r["id"] for r in dossier["reports"]] == ["r1"]
