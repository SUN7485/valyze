from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services.supabase_client import get_max_invoice_number

SERVICE_LEVEL_PRICES = {
    "basic": {"standard": 30.0, "full": 33.0},
    "standard": {"standard": 35.0, "full": 39.0},
    "express": {"standard": 45.0, "full": 50.0},
    "urgent": {"standard": 58.0, "full": 64.0},
}

MODULE_PRICES = {
    "registration": {"standard": 12, "express": 18},
    "ownership_ubo": {"standard": 15, "express": 20},
    "legal_check": {"standard": 15, "express": 20},
    "financials": {"standard": 25, "express": 35},
}

BUNDLE_PRICES = {
    "basic_bundle": 22,
    "risk_bundle": 24,
    "financial_bundle": 28,
    "full_suite": 65,
}

PILOT_PRICE = 25.0
DEFAULT_CURRENCY = "USD"


def calculate_volume_discount_pct(monthly_volume_avg: Any) -> float:
    volume = int(monthly_volume_avg or 0)
    if 50 <= volume <= 99:
        return 5.0
    if 100 <= volume <= 199:
        return 10.0
    if volume >= 200:
        return 15.0
    return 0.0


def _base_unit_price(service_level: str, report_type: str) -> float:
    report_key = "full" if report_type == "full" else "standard"
    return float(SERVICE_LEVEL_PRICES[service_level][report_key])


def calculate_unit_price(
    service_level: str,
    report_type: str,
    is_pilot: bool,
    monthly_volume_avg: Any,
) -> float:
    if is_pilot:
        return PILOT_PRICE

    base_price = _base_unit_price(service_level, report_type)
    discount_pct = calculate_volume_discount_pct(monthly_volume_avg)
    return round(base_price * (1 - discount_pct / 100), 2)


def calculate_invoice(order: Dict[str, Any], client: Dict[str, Any]) -> Dict[str, Any]:
    service_level = order.get("service_level", "standard")
    report_type = order.get("report_type", "standard")
    companies = _company_names(order)
    company_count = int(order.get("company_count") or len(companies) or 0)
    is_pilot = bool(client.get("is_pilot")) and int(client.get("invoice_count") or 0) == 0
    monthly_volume_avg = client.get("monthly_volume_avg", 0)

    base_unit_price = _base_unit_price(service_level, report_type)
    volume_discount_pct = 0.0 if is_pilot else calculate_volume_discount_pct(monthly_volume_avg)
    unit_price = PILOT_PRICE if is_pilot else round(base_unit_price * (1 - volume_discount_pct / 100), 2)

    subtotal = round(base_unit_price * company_count, 2)
    total = round(unit_price * company_count, 2)
    discount_amount = round(max(subtotal - total, 0.0), 2)

    return {
        "unit_price": unit_price,
        "company_count": company_count,
        "subtotal": subtotal,
        "is_pilot": is_pilot,
        "volume_discount_pct": volume_discount_pct,
        "discount_amount": discount_amount,
        "total": total,
        "currency": DEFAULT_CURRENCY,
        "line_items": _line_items(companies, company_count, unit_price),
    }


def generate_invoice_number(max_sequence: Optional[int] = None) -> str:
    if max_sequence is None:
        max_sequence = get_max_invoice_number() or 0
    year = datetime.now(timezone.utc).year
    return f"INV-{year}-{int(max_sequence) + 1:04d}"


def _company_names(order: Dict[str, Any]) -> List[str]:
    companies = order.get("companies") or order.get("company_names") or []
    names: List[str] = []
    for index, company in enumerate(companies, start=1):
        if isinstance(company, dict):
            name = company.get("company_name") or company.get("name")
        else:
            name = company
        if name:
            names.append(str(name))
        else:
            names.append(f"Company {index}")
    return names


def _line_items(company_names: List[str], company_count: int, unit_price: float) -> List[Dict[str, Any]]:
    line_items: List[Dict[str, Any]] = []
    for index in range(company_count):
        company_name = company_names[index] if index < len(company_names) else f"Company {index + 1}"
        line_total = round(unit_price, 2)
        line_items.append(
            {
                "description": f"Credit Report - {company_name}",
                "qty": 1,
                "unit_price": line_total,
                "total": line_total,
            }
        )
    return line_items
