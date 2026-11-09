from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services.supabase_client import (
    create_invoice as sb_create_invoice,
    get_max_invoice_number,
    get_order_invoice,
)

logger = logging.getLogger(__name__)

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

    # Line items are priced at the list price and sum to the subtotal; the
    # pilot/volume reduction is the separate discount line. That keeps one
    # invariant for generated AND edited invoices (see recompute_totals):
    #     subtotal = Σ line totals,  total = subtotal − discount_amount.
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
        "line_items": _line_items(companies, company_count, base_unit_price),
    }


def _non_negative(value: Any, field: str) -> float:
    try:
        number = float(value if value not in (None, "") else 0)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a number")
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"{field} must be a finite number")
    if number < 0:
        raise ValueError(f"{field} cannot be negative")
    return number


def recompute_totals(
    line_items: List[Dict[str, Any]],
    discount_amount: Any = 0,
) -> Dict[str, Any]:
    """Server-side invoice arithmetic — never trust totals sent by a client.

    Each line's total is qty × unit_price; subtotal is the sum of line totals;
    the discount is capped at the subtotal; total = subtotal − discount.
    Raises ValueError for negative or non-numeric amounts.
    """
    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(line_items or [], start=1):
        if not isinstance(item, dict):
            raise ValueError(f"line {index} must be an object")
        qty = _non_negative(item.get("qty", 1), f"line {index} qty")
        unit_price = _non_negative(item.get("unit_price"), f"line {index} unit_price")
        line = dict(item)
        line["qty"] = int(qty) if float(qty).is_integer() else qty
        line["unit_price"] = round(unit_price, 2)
        line["total"] = round(qty * unit_price, 2)
        normalized.append(line)

    subtotal = round(sum(line["total"] for line in normalized), 2)
    discount = round(min(_non_negative(discount_amount, "discount_amount"), subtotal), 2)
    return {
        "line_items": normalized,
        "subtotal": subtotal,
        "discount_amount": discount,
        "total": round(subtotal - discount, 2),
    }


def generate_invoice_number(max_sequence: Optional[int] = None) -> str:
    if max_sequence is None:
        max_sequence = get_max_invoice_number() or 0
    year = datetime.now(timezone.utc).year
    return f"INV-{year}-{int(max_sequence) + 1:04d}"


def _is_invoice_number_collision(exc: Exception) -> bool:
    text = str(exc).lower()
    is_unique = "23505" in text or "duplicate" in text or "unique" in text
    return is_unique and "invoice_number" in text


def create_numbered_invoice(payload: Dict[str, Any], max_attempts: int = 5) -> Dict[str, Any]:
    """Insert an invoice, allocating its number (max + 1) with collision retry.

    Two concurrent inserts can read the same max. When the insert fails:
      * an invoice now exists for this order → another request created it;
        return that one (never a second invoice for the order);
      * the failure is an invoice_number unique violation → re-read the max,
        step past it and retry (like the portal does for order numbers);
      * anything else → re-raise; it is a real error, not "already invoiced".
    Returns the created (or concurrently created) invoice row.
    """
    order_id = payload.get("order_id")
    offset = 0
    last_exc: Optional[Exception] = None
    for _attempt in range(max(1, max_attempts)):
        row = dict(payload)
        row["invoice_number"] = generate_invoice_number((get_max_invoice_number() or 0) + offset)
        try:
            created = sb_create_invoice(row)
        except Exception as exc:
            last_exc = exc
            existing = get_order_invoice(order_id) if order_id else None
            if existing:
                logger.info(f"[INVOICE] Invoice for order {order_id} was created concurrently — using it.")
                return existing
            if _is_invoice_number_collision(exc):
                offset += 1
                logger.warning(f"[INVOICE] {row['invoice_number']} already taken — retrying with the next number.")
                continue
            raise
        if created:
            return created
        raise RuntimeError("Invoice insert returned no row")
    raise RuntimeError(f"Could not allocate a unique invoice number: {last_exc}")


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
