"""Invoice arithmetic and collision-safe invoice numbering (no network)."""

from __future__ import annotations

import pytest

from services import pricing_engine as pe


def test_recompute_totals_ignores_client_math():
    out = pe.recompute_totals(
        [
            {"description": "A", "qty": 2, "unit_price": 35, "total": 999},
            {"description": "B", "qty": 1, "unit_price": "12.5"},
        ],
        discount_amount=10,
    )
    assert [line["total"] for line in out["line_items"]] == [70.0, 12.5]
    assert out["subtotal"] == 82.5
    assert out["discount_amount"] == 10
    assert out["total"] == 72.5


def test_recompute_totals_caps_discount_at_subtotal():
    out = pe.recompute_totals([{"qty": 1, "unit_price": 20}], discount_amount=50)
    assert out["discount_amount"] == 20
    assert out["total"] == 0


@pytest.mark.parametrize("items,discount", [
    ([{"qty": -1, "unit_price": 10}], 0),
    ([{"qty": 1, "unit_price": -10}], 0),
    ([{"qty": 1, "unit_price": "abc"}], 0),
    ([{"qty": 1, "unit_price": 10}], -5),
    (["not a line"], 0),
])
def test_recompute_totals_rejects_bad_amounts(items, discount):
    with pytest.raises(ValueError):
        pe.recompute_totals(items, discount)


def test_generated_invoice_satisfies_the_same_invariant():
    order = {"service_level": "standard", "report_type": "standard",
             "companies": [{"company_name": "A"}, {"company_name": "B"}]}
    client = {"monthly_volume_avg": 120, "invoice_count": 3}
    inv = pe.calculate_invoice(order, client)
    again = pe.recompute_totals(inv["line_items"], inv["discount_amount"])
    assert again["subtotal"] == inv["subtotal"]
    assert again["total"] == inv["total"]
    assert inv["total"] == round(inv["unit_price"] * 2, 2)


def test_create_numbered_invoice_retries_on_number_collision(monkeypatch):
    attempts = []

    def fake_create(row):
        attempts.append(row["invoice_number"])
        if len(attempts) == 1:
            raise Exception('Supabase create invoice failed (409): 23505 duplicate key value violates '
                            'unique constraint "invoices_invoice_number_key" Key (invoice_number)=(INV-2026-0008) already exists.')
        return {**row, "id": "inv-1"}

    monkeypatch.setattr(pe, "sb_create_invoice", fake_create)
    monkeypatch.setattr(pe, "get_max_invoice_number", lambda year=None: 7)
    monkeypatch.setattr(pe, "get_order_invoice", lambda order_id: None)
    created = pe.create_numbered_invoice({"order_id": "o1"})
    assert created["id"] == "inv-1"
    assert attempts[0].endswith("-0008") and attempts[1].endswith("-0009")


def test_create_numbered_invoice_returns_concurrent_invoice_for_same_order(monkeypatch):
    def fake_create(row):
        raise Exception("Supabase create invoice failed (409): 23505 duplicate key Key (order_id)=(o1) already exists.")

    monkeypatch.setattr(pe, "sb_create_invoice", fake_create)
    monkeypatch.setattr(pe, "get_max_invoice_number", lambda year=None: 0)
    monkeypatch.setattr(pe, "get_order_invoice", lambda order_id: {"id": "winner", "order_id": order_id})
    assert pe.create_numbered_invoice({"order_id": "o1"})["id"] == "winner"


def test_create_numbered_invoice_does_not_misread_other_errors(monkeypatch):
    def fake_create(row):
        raise Exception("Supabase create invoice failed (400): column foo does not exist")

    monkeypatch.setattr(pe, "sb_create_invoice", fake_create)
    monkeypatch.setattr(pe, "get_max_invoice_number", lambda year=None: 0)
    monkeypatch.setattr(pe, "get_order_invoice", lambda order_id: None)
    with pytest.raises(Exception, match="column foo"):
        pe.create_numbered_invoice({"order_id": "o1"})
