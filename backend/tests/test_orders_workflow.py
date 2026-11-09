"""Order workflow, role rules and invoice endpoints, against an in-memory
stand-in for services.supabase_client (no network)."""

from __future__ import annotations

import copy
import uuid

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api import auth, invoices, orders
from services import supabase_client as sc

ADMIN = {"sub": "usr_001", "email": "waleed@valyze.com", "name": "Waleed", "role": "admin"}
ANALYST = {"sub": "usr_002", "email": "mohamed@valyze.com", "name": "Mohamed", "role": "analyst"}
USERS = [
    {"id": "usr_001", "email": "waleed@valyze.com", "name": "Waleed", "role": "admin"},
    {"id": "usr_002", "email": "mohamed@valyze.com", "name": "Mohamed", "role": "analyst"},
    {"id": "usr_006", "email": "rita@valyze.com", "name": "Rita", "role": "reviewer"},
]


class Store:
    def __init__(self):
        self.orders = {}
        self.companies = {}
        self.invoices = {}

    # orders
    def get_order(self, order_id):
        row = self.orders.get(order_id)
        return copy.deepcopy(row) if row else None

    def update_order(self, order_id, data):
        if order_id not in self.orders:
            return None
        self.orders[order_id].update(data)
        return copy.deepcopy(self.orders[order_id])

    # companies
    def get_companies(self, order_id):
        return [copy.deepcopy(c) for c in self.companies.values() if c["order_id"] == order_id]

    def get_company(self, company_id):
        row = self.companies.get(company_id)
        return copy.deepcopy(row) if row else None

    def update_company(self, company_id, data, extra_filters=None):
        row = self.companies.get(company_id)
        if not row:
            return None
        for column, cond in (extra_filters or {}).items():
            if cond == "is.null" and row.get(column) is not None:
                return None
        row.update(data)
        return copy.deepcopy(row)

    # invoices
    def get_order_invoice(self, order_id):
        return next((copy.deepcopy(i) for i in self.invoices.values() if i.get("order_id") == order_id), None)

    def create_invoice(self, payload):
        row = {**payload, "id": payload.get("id") or str(uuid.uuid4()), "invoice_number": "INV-2026-0001"}
        self.invoices[row["id"]] = row
        return copy.deepcopy(row)

    def get_invoice(self, invoice_id):
        row = self.invoices.get(invoice_id)
        return copy.deepcopy(row) if row else None

    def update_invoice(self, invoice_id, data):
        if invoice_id not in self.invoices:
            return None
        self.invoices[invoice_id].update(data)
        return copy.deepcopy(self.invoices[invoice_id])

    def all_invoices(self, filters=None, embed=False):
        filters = filters or {}
        return [copy.deepcopy(i) for i in self.invoices.values()
                if all(i.get(k) == v for k, v in filters.items() if v)]


@pytest.fixture
def store(monkeypatch):
    s = Store()
    for name, fn in {
        "sb_get_order": s.get_order,
        "sb_update_order": s.update_order,
        "sb_get_order_companies": s.get_companies,
        "sb_get_order_company": s.get_company,
        "sb_update_order_company": s.update_company,
        "sb_get_order_invoice": s.get_order_invoice,
        "create_numbered_invoice": s.create_invoice,
        "get_order_files": lambda *a, **k: [],
        "get_client": lambda client_id: {"id": client_id, "client_name": "Client"},
        "get_order_assignable_users": lambda: ["waleed@valyze.com", "mohamed@valyze.com"],
        "list_users": lambda: USERS,
    }.items():
        monkeypatch.setattr(orders, name, fn)
    monkeypatch.setattr(sc, "get_all_invoices", s.all_invoices)
    for name, fn in {
        "get_order_with_client": lambda oid: {**s.get_order(oid), "client": {"id": "c1", "client_name": "Client"}} if s.get_order(oid) else None,
        "get_order_invoice": s.get_order_invoice,
        "get_order_companies": s.get_companies,
        "update_order": s.update_order,
        "sb_get_all_invoices": s.all_invoices,
        "sb_get_invoice": s.get_invoice,
        "sb_update_invoice": s.update_invoice,
        "create_numbered_invoice": s.create_invoice,
        "get_client": lambda cid: {"id": cid},
        "get_order": s.get_order,
        "get_rows_by_ids": lambda *a, **k: [],
    }.items():
        monkeypatch.setattr(invoices, name, fn)
    return s


def _client(user):
    app = FastAPI()
    app.include_router(orders.router, prefix="/api/orders")
    app.include_router(invoices.router, prefix="/api/invoices")
    app.dependency_overrides[auth.get_current_user] = lambda: user
    return TestClient(app)


def _order(store, status="in_progress", companies=("completed", "in_progress")):
    order_id = str(uuid.uuid4())
    store.orders[order_id] = {
        "id": order_id, "order_number": "ORD-2026-0001", "client_id": "c1", "status": status,
        "service_level": "standard", "report_type": "standard",
        "company_count": 99, "completed_count": 99,
    }
    ids = []
    for i, st in enumerate(companies):
        cid = str(uuid.uuid4())
        store.companies[cid] = {"id": cid, "order_id": order_id, "company_name": f"Co {i}",
                                "status": st, "report_id": None, "sort_order": i}
        ids.append(cid)
    return order_id, ids


# ---------------------------------------------------------------------------
# Transition table
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("current,target,ok", [
    ("pending", "in_progress", True),
    ("pending", "cancelled", True),
    ("pending", "completed", False),
    ("in_progress", "completed", True),
    ("in_progress", "invoiced", False),
    ("completed", "in_progress", True),
    ("completed", "pending", False),
    ("invoiced", "pending", False),
    ("invoiced", "cancelled", False),
    ("cancelled", "pending", False),
    ("cancelled", "cancelled", True),
])
def test_transition_table(current, target, ok):
    if ok:
        orders.check_status_transition(current, target)
    else:
        with pytest.raises(HTTPException) as exc:
            orders.check_status_transition(current, target)
        assert exc.value.status_code == 409


def test_transition_rejects_unknown_status():
    with pytest.raises(HTTPException) as exc:
        orders.check_status_transition("pending", "shipped")
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# PATCH /orders/{id}
# ---------------------------------------------------------------------------

def test_status_and_counter_changes_are_admin_only(store):
    order_id, _ = _order(store)
    c = _client(ANALYST)
    assert c.patch(f"/api/orders/{order_id}", json={"status": "cancelled"}).status_code == 403
    assert c.patch(f"/api/orders/{order_id}", json={"completed_count": 5}).status_code == 403
    assert c.patch(f"/api/orders/{order_id}", json={"notes": "hello"}).status_code == 200


def test_counts_are_derived_from_companies(store):
    order_id, _ = _order(store)
    r = _client(ADMIN).patch(f"/api/orders/{order_id}", json={"company_count": 50, "completed_count": 50})
    assert r.status_code == 200
    assert store.orders[order_id]["company_count"] == 2
    assert store.orders[order_id]["completed_count"] == 1


def test_cannot_complete_with_unfinished_companies_and_no_invoice_is_created(store):
    order_id, _ = _order(store)
    r = _client(ADMIN).patch(f"/api/orders/{order_id}", json={"status": "completed"})
    assert r.status_code == 409
    assert store.orders[order_id]["status"] == "in_progress"
    assert not store.invoices


def test_completing_a_finished_order_creates_invoice_and_marks_invoiced(store):
    order_id, _ = _order(store, companies=("completed", "completed"))
    r = _client(ADMIN).patch(f"/api/orders/{order_id}", json={"status": "completed"})
    assert r.status_code == 200
    assert len(store.invoices) == 1
    assert store.orders[order_id]["status"] == "invoiced"
    assert r.json()["status"] == "invoiced"


def test_cancel_via_patch_cancels_open_companies(store):
    order_id, ids = _order(store)
    r = _client(ADMIN).patch(f"/api/orders/{order_id}", json={"status": "cancelled"})
    assert r.status_code == 200
    assert store.companies[ids[0]]["status"] == "completed"
    assert store.companies[ids[1]]["status"] == "cancelled"


# ---------------------------------------------------------------------------
# Company workflow
# ---------------------------------------------------------------------------

def test_complete_last_company_returns_order_status(store):
    order_id, ids = _order(store)
    r = _client(ANALYST).post(f"/api/orders/{order_id}/companies/{ids[1]}/complete")
    assert r.status_code == 200
    body = r.json()
    assert body["order_status"] == "invoiced"
    assert body["progress"]["completed"] == 2
    assert len(store.invoices) == 1


def test_complete_non_last_company_returns_current_status(store):
    order_id, ids = _order(store, companies=("in_progress", "in_progress"))
    r = _client(ANALYST).post(f"/api/orders/{order_id}/companies/{ids[0]}/complete")
    assert r.status_code == 200
    assert r.json()["order_status"] == "in_progress"
    assert not store.invoices


@pytest.mark.parametrize("status", ["cancelled", "invoiced"])
def test_closed_orders_cannot_be_worked_on(store, status):
    order_id, ids = _order(store, status=status, companies=("in_progress", "pending"))
    c = _client(ANALYST)
    assert c.post(f"/api/orders/{order_id}/companies/{ids[0]}/complete").status_code == 409
    assert c.post(f"/api/orders/{order_id}/companies/{ids[1]}/start").status_code == 409
    assert store.orders[order_id]["status"] == status
    assert not store.invoices


def test_complete_order_if_ready_does_not_reopen_cancelled(store):
    order_id, _ = _order(store, status="cancelled", companies=("completed",))
    progress, status = orders._complete_order_if_ready(order_id)
    assert status == "cancelled"
    assert store.orders[order_id]["status"] == "cancelled"
    assert not store.invoices


def test_pricing_failure_creates_no_zero_invoice(store, monkeypatch):
    order_id, _ = _order(store, companies=("completed",))

    def boom(*a, **k):
        raise KeyError("unknown service level")

    monkeypatch.setattr(orders, "calculate_invoice", boom)
    progress, status = orders._complete_order_if_ready(order_id)
    assert status == "completed"
    assert not store.invoices


def test_company_patch_rejects_workflow_fields(store):
    order_id, ids = _order(store)
    c = _client(ADMIN)
    for field, value in (("status", "completed"), ("analyst_assigned", "x@y.z"), ("report_id", "r1")):
        assert c.patch(f"/api/orders/{order_id}/companies/{ids[0]}", json={field: value}).status_code == 422
    assert c.patch(f"/api/orders/{order_id}/companies/{ids[0]}", json={"comments": "ok"}).status_code == 200


# ---------------------------------------------------------------------------
# Analysts + reassignment
# ---------------------------------------------------------------------------

def test_analysts_endpoint_is_not_shadowed_by_order_id_route(store):
    r = _client(ANALYST).get("/api/orders/analysts")
    assert r.status_code == 200
    assert r.json() == {"analysts": [
        {"email": "mohamed@valyze.com", "name": "Mohamed", "role": "analyst"},
        {"email": "waleed@valyze.com", "name": "Waleed", "role": "admin"},
    ]}


def test_reassign_company_checks_order_membership_and_analyst(store):
    order_a, ids_a = _order(store)
    order_b, _ = _order(store)
    c = _client(ADMIN)
    assert c.post(f"/api/orders/{order_b}/reassign-company/{ids_a[0]}", json={"analyst": "mohamed@valyze.com"}).status_code == 404
    assert c.post(f"/api/orders/{order_a}/reassign-company/{ids_a[0]}", json={"analyst": "nobody@x.com"}).status_code == 400
    r = c.post(f"/api/orders/{order_a}/reassign-company/{ids_a[0]}", json={"analyst": "MOHAMED@valyze.com"})
    assert r.status_code == 200
    assert store.companies[ids_a[0]]["analyst_assigned"] == "mohamed@valyze.com"


def test_reassign_order_rejects_non_assignable_user(store):
    order_id, _ = _order(store)
    r = _client(ADMIN).post(f"/api/orders/{order_id}/reassign", json={"analyst": "rita@valyze.com"})
    assert r.status_code == 400


def test_company_list_validates_status(store, monkeypatch):
    seen = {}

    def fake_list(**kwargs):
        seen.update(kwargs)
        return []

    monkeypatch.setattr(orders, "sb_get_all_order_companies", fake_list)
    c = _client(ANALYST)
    assert c.get("/api/orders/companies/", params={"status": "invoiced"}).status_code == 400
    assert c.get("/api/orders/companies/", params={"status": "in_progress"}).status_code == 200
    assert seen["status"] == "in_progress"
    assert c.get("/api/orders/companies/", params={"status": "overdue"}).status_code == 200
    assert seen["status"] is None


def test_delete_refuses_when_invoice_exists(store):
    order_id, _ = _order(store, status="completed", companies=("completed",))
    store.create_invoice({"order_id": order_id})
    assert _client(ADMIN).delete(f"/api/orders/{order_id}").status_code == 409


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------

def test_invoice_writes_are_admin_only(store):
    order_id, _ = _order(store, status="completed", companies=("completed",))
    inv = store.create_invoice({"order_id": order_id, "client_id": "c1", "line_items": [], "discount_amount": 0})
    c = _client(ANALYST)
    assert c.post(f"/api/invoices/generate/{order_id}").status_code == 403
    assert c.patch(f"/api/invoices/{inv['id']}/status", json={"status": "paid"}).status_code == 403
    assert c.patch(f"/api/invoices/{inv['id']}", json={"notes": "x"}).status_code == 403
    assert c.get(f"/api/invoices/{inv['id']}").status_code == 200


def test_invoice_patch_recomputes_totals(store):
    inv = store.create_invoice({"order_id": "o", "client_id": "c1", "line_items": [], "discount_amount": 0})
    r = _client(ADMIN).patch(f"/api/invoices/{inv['id']}", json={
        "line_items": [{"description": "A", "qty": 2, "unit_price": 40, "total": 1}],
        "discount_amount": 5,
        "subtotal": 1_000_000,
        "total": 1,
    })
    assert r.status_code == 200
    saved = store.invoices[inv["id"]]
    assert saved["subtotal"] == 80
    assert saved["discount_amount"] == 5
    assert saved["total"] == 75
    assert saved["line_items"][0]["total"] == 80


@pytest.mark.parametrize("payload", [
    {"discount_amount": -1},
    {"total": -10},
    {"line_items": [{"qty": 1, "unit_price": -5}]},
])
def test_invoice_patch_rejects_negative_amounts(store, payload):
    inv = store.create_invoice({"order_id": "o", "client_id": "c1", "line_items": []})
    r = _client(ADMIN).patch(f"/api/invoices/{inv['id']}", json=payload)
    assert r.status_code in (400, 422)


def test_generate_adopts_existing_invoice(store):
    order_id, _ = _order(store, status="completed", companies=("completed",))
    inv = store.create_invoice({"order_id": order_id, "client_id": "c1"})
    r = _client(ADMIN).post(f"/api/invoices/generate/{order_id}")
    assert r.status_code == 200
    assert r.json()["id"] == inv["id"]
    assert store.orders[order_id]["status"] == "invoiced"
    assert len(store.invoices) == 1


def test_generate_creates_invoice_for_completed_order(store):
    order_id, _ = _order(store, status="completed", companies=("completed", "completed"))
    r = _client(ADMIN).post(f"/api/invoices/generate/{order_id}")
    assert r.status_code == 200
    saved = store.invoices[r.json()["id"]]
    assert saved["company_count"] == 2
    assert [li["description"] for li in saved["line_items"]] == ["Credit Report - Co 0", "Credit Report - Co 1"]
    assert store.orders[order_id]["status"] == "invoiced"
