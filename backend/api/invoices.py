from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam
from fastapi.responses import Response
from pydantic import BaseModel

from api.auth import get_current_user
from services.pricing_engine import calculate_invoice, generate_invoice_number
from services.supabase_client import (
    create_invoice as sb_create_invoice,
    get_all_invoices as sb_get_all_invoices,
    get_client,
    get_invoice as sb_get_invoice,
    get_order,
    get_order_companies,
    get_order_invoice,
    get_order_with_client,
    update_invoice as sb_update_invoice,
    update_order,
)

router = APIRouter(tags=["invoices"])

VALID_INVOICE_STATUSES = {"draft", "sent", "paid"}


class UpdateInvoiceStatusRequest(BaseModel):
    status: Literal["draft", "sent", "paid"]


def _money(value: Any) -> str:
    try:
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def _date_label(value: Any) -> str:
    if value:
        return str(value)
    return datetime.now(timezone.utc).date().isoformat()


def _company_names(companies: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    normalized = []
    for index, company in enumerate(companies, start=1):
        name = company.get("company_name") if isinstance(company, dict) else None
        normalized.append({"company_name": name or f"Company {index}"})
    return normalized


def _pricing_client(client: Dict[str, Any], existing_invoice_count: int) -> Dict[str, Any]:
    pricing_client = dict(client)
    pricing_client["invoice_count"] = existing_invoice_count
    return pricing_client


def _pricing_order(order: Dict[str, Any], companies: List[Dict[str, Any]]) -> Dict[str, Any]:
    pricing_order = dict(order)
    pricing_order["companies"] = _company_names(companies)
    return pricing_order


def _invoice_payload(order: Dict[str, Any], client: Dict[str, Any], pricing: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "invoice_number": generate_invoice_number(),
        "order_id": order.get("id"),
        "client_id": client.get("id"),
        "service_level": order.get("service_level"),
        "report_type": order.get("report_type"),
        "company_count": pricing.get("company_count"),
        "unit_price": pricing.get("unit_price"),
        "subtotal": pricing.get("subtotal"),
        "is_pilot": pricing.get("is_pilot"),
        "volume_discount_pct": pricing.get("volume_discount_pct"),
        "discount_amount": pricing.get("discount_amount"),
        "total": pricing.get("total"),
        "currency": pricing.get("currency", "USD"),
        "line_items": pricing.get("line_items", []),
        "status": "draft",
        "notes": "Payment due within 30 days. Please include the invoice number with payment.",
    }


def _get_order_and_client(order_id: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    order = get_order_with_client(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    client = order.get("client")
    if not client and order.get("client_id"):
        client = get_client(order["client_id"])
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    return order, client


def _enrich_invoice_summary(invoice: Dict[str, Any]) -> Dict[str, Any]:
    client_name = None
    order_number = None
    client = invoice.get("client")
    order = invoice.get("order")

    if not client and invoice.get("client_id"):
        client = get_client(invoice["client_id"])
    if not order and invoice.get("order_id"):
        order = get_order(invoice["order_id"])

    if isinstance(client, dict):
        client_name = client.get("client_name")
    if isinstance(order, dict):
        order_number = order.get("order_number")

    return {
        "id": invoice.get("id"),
        "invoice_number": invoice.get("invoice_number"),
        "client_name": client_name,
        "order_number": order_number,
        "total": invoice.get("total"),
        "status": invoice.get("status"),
        "created_at": invoice.get("created_at"),
    }


def _enrich_invoice_detail(invoice: Dict[str, Any]) -> Dict[str, Any]:
    client = invoice.get("client")
    order = invoice.get("order")

    if not client and invoice.get("client_id"):
        client = get_client(invoice["client_id"])
    if not order and invoice.get("order_id"):
        order = get_order(invoice["order_id"])

    return {
        **invoice,
        "client": client,
        "order": order,
        "line_items": invoice.get("line_items") or [],
    }


def _render_invoice_html(invoice: Dict[str, Any]) -> str:
    client = invoice.get("client") or {}
    order = invoice.get("order") or {}
    line_items = invoice.get("line_items") or []
    invoice_number = html.escape(str(invoice.get("invoice_number") or ""))
    invoice_date = html.escape(_date_label(invoice.get("created_at")))
    client_name = html.escape(str(client.get("client_name") or "Client"))
    valyze_id = html.escape(str(client.get("valyze_id") or ""))
    client_email = html.escape(str(client.get("email") or ""))
    client_country = html.escape(str(client.get("country") or ""))
    order_number = html.escape(str(order.get("order_number") or invoice.get("order_id") or ""))
    rows = []
    for item in line_items:
        description = html.escape(str(item.get("description") or "Credit Report"))
        qty = html.escape(str(item.get("qty") or 1))
        unit_price = html.escape(_money(item.get("unit_price")))
        total = html.escape(_money(item.get("total")))
        rows.append(
            "<tr>"
            f"<td>{description}</td>"
            f"<td>{qty}</td>"
            f"<td>{unit_price}</td>"
            f"<td>{total}</td>"
            "</tr>"
        )
    if not rows:
        rows.append("<tr><td colspan='4'>No line items</td></tr>")

    return f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice {invoice_number}</title>
  <style>
    body {{ margin: 0; background: #0f172a; color: #e5e7eb; font-family: Arial, sans-serif; }}
    .page {{ max-width: 900px; margin: 40px auto; background: #111827; border: 1px solid #334155; border-radius: 18px; padding: 32px; box-shadow: 0 24px 80px rgba(0,0,0,0.35); }}
    .brand {{ display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid #334155; padding-bottom: 24px; }}
    .logo {{ font-size: 28px; font-weight: 800; color: #60a5fa; letter-spacing: 0.04em; }}
    .meta {{ text-align: right; color: #cbd5e1; line-height: 1.7; }}
    h1 {{ margin: 28px 0 8px; font-size: 26px; }}
    .subtle {{ color: #94a3b8; margin-bottom: 24px; }}
    table {{ width: 100%; border-collapse: collapse; margin: 24px 0; }}
    th, td {{ padding: 14px; border-bottom: 1px solid #334155; text-align: left; }}
    th {{ color: #93c5fd; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; }}
    td {{ color: #e5e7eb; }}
    .totals {{ margin-left: auto; width: 320px; }}
    .total-row {{ display: flex; justify-content: space-between; padding: 10px 0; color: #cbd5e1; }}
    .total-row.final {{ color: #ffffff; font-size: 22px; font-weight: 800; border-top: 1px solid #475569; margin-top: 8px; padding-top: 16px; }}
    .terms {{ margin-top: 32px; padding: 18px; background: #020617; border-left: 4px solid #60a5fa; color: #cbd5e1; line-height: 1.6; }}
  </style>
</head>
<body>
  <main class="page">
    <section class="brand">
      <div>
        <div class="logo">VALYZE</div>
        <div class="subtle">Credit Intelligence Platform</div>
      </div>
      <div class="meta">
        <strong>Invoice {invoice_number}</strong><br />
        Date: {invoice_date}<br />
        Order: {order_number}
      </div>
    </section>

    <h1>Invoice</h1>
    <div class="subtle">
      <strong>{client_name}</strong><br />
      Valyze ID: {valyze_id}<br />
      {client_email}<br />
      {client_country}
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {''.join(rows)}
      </tbody>
    </table>

    <section class="totals">
      <div class="total-row"><span>Subtotal</span><span>{html.escape(_money(invoice.get('subtotal')))}</span></div>
      <div class="total-row"><span>Discount</span><span>- {html.escape(_money(invoice.get('discount_amount')))}</span></div>
      <div class="total-row final"><span>Total</span><span>{html.escape(_money(invoice.get('total')))}</span></div>
    </section>

    <section class="terms">
      <strong>Payment terms:</strong> Payment is due within 30 days. Please include invoice number {invoice_number} with payment.
    </section>
  </main>
</body>
</html>
"""


@router.post("/generate/{order_id}")
async def generate_invoice(
    order_id: str = PathParam(..., description="Order id"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    order, client = _get_order_and_client(order_id)
    if order.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Only completed orders can be invoiced")

    company_count = int(order.get("company_count") or 0)
    completed_count = int(order.get("completed_count") or 0)
    if company_count <= 0 or completed_count < company_count:
        raise HTTPException(status_code=400, detail="Order is not fully completed")

    if get_order_invoice(order_id):
        raise HTTPException(status_code=409, detail="Invoice already exists for this order")

    companies = get_order_companies(order_id)
    existing_invoices = sb_get_all_invoices({"client_id": client.get("id")})
    pricing_order = _pricing_order(order, companies)
    pricing_client = _pricing_client(client, len(existing_invoices))
    pricing = calculate_invoice(pricing_order, pricing_client)
    payload = _invoice_payload(order, client, pricing)

    created = sb_create_invoice(payload)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create invoice")

    updated = update_order(
        order_id,
        {
            "status": "invoiced",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update order status")

    return _enrich_invoice_detail(created)


@router.get("/")
async def list_invoices(
    status: Optional[Literal["draft", "sent", "paid"]] = None,
    client_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user),
):
    filters: Dict[str, Any] = {}
    if status:
        filters["status"] = status
    if client_id:
        filters["client_id"] = client_id
    invoices = sb_get_all_invoices(filters)
    return [_enrich_invoice_summary(invoice) for invoice in invoices]


@router.get("/{invoice_id}")
async def get_invoice_detail(
    invoice_id: str = PathParam(..., description="Invoice id"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    invoice = sb_get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _enrich_invoice_detail(invoice)


@router.patch("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str,
    body: UpdateInvoiceStatusRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    invoice = sb_get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if body.status not in VALID_INVOICE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid invoice status")

    updated = sb_update_invoice(
        invoice_id,
        {
            "status": body.status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update invoice")
    return _enrich_invoice_detail(updated)


@router.get("/{invoice_id}/html")
async def get_invoice_html(
    invoice_id: str = PathParam(..., description="Invoice id"),
    user: Dict[str, Any] = Depends(get_current_user),
):
    invoice = sb_get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return Response(
        content=_render_invoice_html(_enrich_invoice_detail(invoice)),
        media_type="text/html",
    )
