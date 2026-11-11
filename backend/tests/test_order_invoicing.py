"""Auto-invoicing when an order completes (api/orders.py _trigger_invoice_creation)."""
import pytest

import api.orders as orders
import services.pricing_engine as pricing
import services.supabase_client as sb


@pytest.fixture
def created(monkeypatch):
    """Stub the Supabase calls; collect whatever invoice payload gets written."""
    out = []
    monkeypatch.setattr(orders, "sb_get_order_invoice", lambda order_id: None)
    monkeypatch.setattr(orders, "get_client", lambda client_id: {"id": client_id, "monthly_volume_avg": 0})
    monkeypatch.setattr(sb, "get_all_invoices", lambda *_a, **_k: [])
    monkeypatch.setattr(pricing, "get_max_invoice_number", lambda: 7)
    monkeypatch.setattr(orders, "sb_create_invoice", lambda payload: out.append(payload) or payload)
    return out


def test_completed_order_gets_a_priced_draft(created):
    order = {"id": "o1", "client_id": "c1", "service_level": "express", "report_type": "standard", "company_count": 2}
    orders._trigger_invoice_creation(order, [{"company_name": "A"}, {"company_name": "B"}])
    (inv,) = created
    assert inv["total"] == 90.0 and inv["status"] == "draft"
    assert inv["invoice_number"].endswith("-0008")
    assert "UNPRICED" not in inv["notes"]


def test_unpriceable_order_draft_is_flagged_not_silent(created):
    order = {"id": "o2", "client_id": "c1", "service_level": "platinum", "company_count": 1}
    orders._trigger_invoice_creation(order, [{"company_name": "A"}])
    (inv,) = created
    assert inv["total"] == 0
    assert inv["notes"].startswith("UNPRICED") and "platinum" in inv["notes"]
