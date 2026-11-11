import re

import pytest

from services.pricing_engine import (
    PILOT_PRICE,
    calculate_invoice,
    calculate_volume_discount_pct,
    generate_invoice_number,
    resolve_service_level,
)


@pytest.mark.parametrize(
    "volume, pct",
    [(None, 0.0), (0, 0.0), (49, 0.0), (50, 5.0), (99, 5.0), (100, 10.0), (199, 10.0), (200, 15.0), (5000, 15.0)],
)
def test_volume_discount_tiers(volume, pct):
    assert calculate_volume_discount_pct(volume) == pct


@pytest.mark.parametrize(
    "order, tier",
    [
        ({"service_level": "express"}, "express"),
        ({"service_level": " Urgent "}, "urgent"),          # casing / whitespace
        ({"service_level": "3_days"}, "standard"),          # speed key stored as level
        ({"service_level": None, "speed": "24_hours"}, "urgent"),
        ({"service_level": "", "speed": "7_days"}, "basic"),
        ({}, "standard"),                                    # nothing set -> documented default
    ],
)
def test_resolve_service_level(order, tier):
    assert resolve_service_level(order) == tier


def test_unknown_service_level_refuses_to_guess():
    with pytest.raises(ValueError, match="unknown service level"):
        resolve_service_level({"service_level": "platinum"})


def test_standard_invoice_no_discount():
    inv = calculate_invoice(
        {"service_level": "standard", "report_type": "standard", "companies": [{"company_name": "Acme"}, "Beta"]},
        {"monthly_volume_avg": 10},
    )
    assert inv["unit_price"] == 35.0
    assert inv["company_count"] == 2
    assert inv["subtotal"] == inv["total"] == 70.0
    assert inv["discount_amount"] == 0.0
    assert [li["description"] for li in inv["line_items"]] == ["Credit Report - Acme", "Credit Report - Beta"]


def test_volume_discount_applies_to_total_not_subtotal():
    inv = calculate_invoice(
        {"service_level": "urgent", "report_type": "full", "companies": ["A", "B", "C"]},
        {"monthly_volume_avg": 120},
    )
    assert inv["subtotal"] == 3 * 64.0
    assert inv["unit_price"] == round(64.0 * 0.9, 2)
    assert inv["total"] == round(3 * 64.0 * 0.9, 2)
    assert inv["discount_amount"] == round(inv["subtotal"] - inv["total"], 2)
    assert sum(li["total"] for li in inv["line_items"]) == pytest.approx(inv["total"])


def test_pilot_price_only_on_first_invoice():
    order = {"service_level": "express", "companies": ["A"]}
    first = calculate_invoice(order, {"is_pilot": True, "invoice_count": 0, "monthly_volume_avg": 500})
    later = calculate_invoice(order, {"is_pilot": True, "invoice_count": 1})
    assert first["is_pilot"] is True and first["unit_price"] == PILOT_PRICE
    assert first["volume_discount_pct"] == 0.0
    assert later["is_pilot"] is False and later["unit_price"] == 45.0


def test_null_service_level_from_db_is_priced_from_speed():
    """Regression: a NULL service_level used to raise KeyError, and order completion
    then silently created a $0 invoice."""
    inv = calculate_invoice({"service_level": None, "speed": "2_days", "companies": ["A"]}, {})
    assert inv["total"] == 45.0


def test_company_count_overrides_names_and_pads_line_items():
    inv = calculate_invoice({"service_level": "basic", "company_count": 3, "companies": ["Only one"]}, {})
    assert len(inv["line_items"]) == 3
    assert inv["line_items"][2]["description"] == "Credit Report - Company 3"


def test_invoice_number_format():
    assert re.fullmatch(r"INV-\d{4}-0042", generate_invoice_number(41))
