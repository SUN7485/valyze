"""
Orders API — Manages client orders and their associated order_companies.

An order is a batch of companies submitted by a client for credit report generation.
Each order_company becomes one Valyze report.
"""

from __future__ import annotations

import io
import json
import uuid
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from api.auth import get_current_user, get_order_assignable_users, list_users, require_admin
from database.crud import add_uploaded_file, create_report, update_report_field, update_report_status
from services.order_documents import build_order_html, WORD_MIME
from services.pricing_engine import calculate_invoice, create_numbered_invoice
import logging
from services.supabase_client import (
    create_order as sb_create_order,
    create_signed_url,
    delete_order as sb_delete_order,
    delete_order_company as sb_delete_order_company,
    download_from_storage,
    get_all_orders as sb_get_all_orders,
    get_all_order_companies as sb_get_all_order_companies,
    get_analyst_workload as sb_get_analyst_workload,
    get_active_order_assignments as sb_get_active_order_assignments,
    get_client,
    get_max_order_number,
    get_order as sb_get_order,
    get_order_company as sb_get_order_company,
    get_order_companies as sb_get_order_companies,
    get_order_files,
    get_order_invoice as sb_get_order_invoice,
    update_order as sb_update_order,
    update_order_company as sb_update_order_company,
)

logger = logging.getLogger(__name__)

try:  # shared RFC 5987 helper (api/_http.py); inline fallback keeps this importable alone
    from api._http import content_disposition
except Exception:  # pragma: no cover - defensive
    def content_disposition(filename: str, disposition: str = "attachment") -> str:
        name = re.sub(r"[\x00-\x1f\x7f]", "", str(filename or "")).strip() or "download"
        ascii_name = re.sub(r'[^A-Za-z0-9._ -]+', "_", name).strip(" ._") or "download"
        return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name, safe='')}"

# Local upload directory for report files
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))

def _sanitize_filename(filename: str) -> str:
    """Sanitize a filename for safe storage."""
    if not filename:
        return "unnamed_file"
    filename = Path(filename).name
    filename = re.sub(r"[^\w\-\.\s]", "_", filename)
    filename = filename.strip(". ")
    if not filename:
        return "unnamed_file"
    if len(filename) > 255:
        name, ext = Path(filename).stem, Path(filename).suffix
        filename = name[:255 - len(ext)] + ext
    return filename


router = APIRouter(tags=["orders"])

VALID_STATUSES = {"pending", "in_progress", "completed", "invoiced", "cancelled"}
# "cancelled" is written by cancel_order for the companies of a cancelled order.
VALID_COMPANY_STATUSES = {"pending", "in_progress", "completed", "cancelled"}
# /orders/companies/ also accepts the UI's "overdue" tab (a due-date view, not a
# stored status).
COMPANY_STATUS_FILTERS = VALID_COMPANY_STATUSES | {"overdue"}

# Orders that are closed for work: nothing may start, complete or reopen them.
CLOSED_ORDER_STATUSES = {"cancelled", "invoiced"}

# Allowed manual status changes via PATCH /orders/{id} (admin only). The normal
# lifecycle is driven by the workflow endpoints instead: start → in_progress,
# last company complete → completed → (invoice created) → invoiced.
# - completed requires every company to be completed;
# - invoiced is only set by invoice creation, never by hand;
# - cancelled and invoiced are terminal.
ORDER_STATUS_TRANSITIONS: Dict[str, set] = {
    "pending": {"in_progress", "cancelled"},
    "in_progress": {"pending", "completed", "cancelled"},
    "completed": {"in_progress"},
    "invoiced": set(),
    "cancelled": set(),
}

# Above this, the ZIP is refused: Vercel caps a serverless RESPONSE at ~4.5 MB.
# The /files endpoint returns signed Storage URLs instead.
ZIP_MAX_BYTES = 4 * 1024 * 1024
VALID_SERVICE_LEVELS = {"basic", "standard", "express", "urgent"}
VALID_REPORT_TYPES = {"standard", "full"}


class CreateOrderRequest(BaseModel):
    client_id: str
    client_ref: Optional[str] = None
    service_level: str = "standard"
    due_date: Optional[str] = None
    report_type: str = "standard"
    notes: Optional[str] = None


class UpdateOrderRequest(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[str] = None
    service_level: Optional[str] = None
    report_type: Optional[str] = None
    client_ref: Optional[str] = None
    company_count: Optional[int] = Field(default=None, ge=0)
    completed_count: Optional[int] = Field(default=None, ge=0)
    auto_assigned_analyst: Optional[str] = None
    submitted_via_portal: Optional[bool] = None


class UpdateCompanyRequest(BaseModel):
    # status / analyst_assigned / report_id are NOT editable here — they move
    # only through /start, /complete and /reassign-company, which enforce the
    # workflow and the admin check. Unknown fields are rejected (422), so a
    # caller sending them learns that instead of being silently ignored.
    model_config = ConfigDict(extra="forbid")

    company_name: Optional[str] = None
    client_ref: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    registration_no: Optional[str] = None
    comments: Optional[str] = None
    sort_order: Optional[int] = None
    vat_no: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    requested_limit: Optional[str] = None
    date_assigned: Optional[str] = None


def _model_dump(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _validate_status(status: str):
    if status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Valid: {', '.join(sorted(VALID_STATUSES))}",
        )


def _validate_company_status(status: str):
    if status not in VALID_COMPANY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid company status. Valid: pending, in_progress, completed",
        )


def assign_analyst(order: Optional[Dict[str, Any]] = None) -> str:
    """
    Auto-assign an analyst based on lowest active workload.

    Round-robin through assignable users: waleed -> mohamed -> mahmoud -> amani -> sally.
    Tie on workload -> rotate forward from the most recently assigned analyst.
    Uses all existing orders (not just active) to find rotation anchor.
    """
    workload_rows = sb_get_analyst_workload()
    assignable_users = get_order_assignable_users()
    if not assignable_users:
        raise HTTPException(status_code=503, detail="No analyst or admin users are available for assignment")

    # Workload rows are {"auto_assigned_analyst": email, "count": n}, counted
    # from active (pending/in_progress) orders; emails compared lower-cased.
    by_lower = {email.lower(): email for email in assignable_users}
    workload: Dict[str, int] = {email: 0 for email in assignable_users}
    for row in workload_rows:
        email = by_lower.get(str(row.get("auto_assigned_analyst") or "").strip().lower())
        if email is None:
            continue
        try:
            workload[email] += int(row.get("count") or 0)
        except (TypeError, ValueError):
            continue

    min_count = min(workload[email] for email in assignable_users)
    tied = [email for email in assignable_users if workload[email] == min_count]
    if len(tied) == 1:
        return tied[0]

    # Use most recent order (any status) as rotation anchor
    anchor = _get_rotation_anchor(assignable_users)
    if anchor:
        anchor_idx = assignable_users.index(anchor)
        for offset in range(1, len(assignable_users) + 1):
            candidate = assignable_users[(anchor_idx + offset) % len(assignable_users)]
            if candidate in tied:
                return candidate

    # No anchor yet (first orders) -> round-robin from first user
    return tied[0]


def _get_rotation_anchor(assignable_users: List[str]) -> Optional[str]:
    """Return the most recently assigned analyst to use as rotation anchor."""
    from services.supabase_client import _handle_response, get_base_url, get_headers

    import requests

    url = (
        f"{get_base_url()}/orders"
        f"?select=auto_assigned_analyst,created_at"
        f"&auto_assigned_analyst=not.is.null"
        f"&order=created_at.desc.nullslast"
        f"&limit=1"
    )
    try:
        response = requests.get(url, headers=get_headers(), timeout=15)
        results = _handle_response(response)
        if not results:
            return None
        latest = results[0]
        email = latest.get("auto_assigned_analyst")
        if email in assignable_users:
            return email
        return None
    except requests.exceptions.RequestException:
        return None


def generate_order_number(extra_offset: int = 0) -> str:
    now = datetime.now(timezone.utc)
    year = now.year
    max_seq = get_max_order_number(year) or 0
    return f"ORD-{year}-{max_seq + 1 + extra_offset:04d}"


def _client_name_from_order(order: Dict[str, Any]) -> Optional[str]:
    client = order.get("client")
    if isinstance(client, dict):
        return client.get("client_name") or order.get("client_name")
    return order.get("client_name")


def _public_order_summary(order: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": order.get("id"),
        "order_number": order.get("order_number"),
        "client_id": order.get("client_id"),
        "client_name": _client_name_from_order(order),
        "service_level": order.get("service_level"),
        "status": order.get("status"),
        "company_count": order.get("company_count", 0),
        "completed_count": order.get("completed_count", 0),
        "due_date": order.get("due_date"),
        "date_received": order.get("date_received"),
        "auto_assigned_analyst": order.get("auto_assigned_analyst"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
    }


def _public_company(company: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": company.get("id"),
        "company_name": company.get("company_name"),
        "client_ref": company.get("client_ref"),
        "country": company.get("country"),
        "registration_no": company.get("registration_no"),
        "vat_no": company.get("vat_no"),
        "phone": company.get("phone"),
        "address": company.get("address"),
        "requested_limit": company.get("requested_limit"),
        "comments": company.get("comments"),
        "status": company.get("status"),
        "analyst_assigned": company.get("analyst_assigned"),
        "report_id": company.get("report_id"),
        "sort_order": company.get("sort_order", 0),
        "created_at": company.get("created_at"),
        "updated_at": company.get("updated_at"),
    }


def _public_order_file(file: Dict[str, Any]) -> Dict[str, Any]:
    order_id = file.get("order_id")
    filename = file.get("filename")
    return {
        "id": file.get("id"),
        "order_id": order_id,
        "order_company_id": file.get("order_company_id"),
        "filename": filename,
        "file_type": file.get("file_type"),
        "file_size": file.get("file_size", 0),
        "file_url": f"/uploads/portal/{quote(str(order_id), safe='')}/{quote(str(filename), safe='')}" if order_id and filename else None,
        "created_at": file.get("created_at"),
    }


def _progress_from_companies(companies: List[Dict[str, Any]]) -> Dict[str, int]:
    total = len(companies)
    completed = sum(1 for company in companies if company.get("status") == "completed")
    in_progress = sum(1 for company in companies if company.get("status") == "in_progress")
    pending = sum(1 for company in companies if company.get("status") == "pending")
    return {
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "pending": max(total - completed - in_progress, 0),
    }


def _build_order_detail(
    order: Dict[str, Any],
    companies: Optional[List[Dict[str, Any]]] = None,
    invoice: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    companies = companies if companies is not None else sb_get_order_companies(order.get("id", ""))
    invoice = invoice if invoice is not None else sb_get_order_invoice(order.get("id", ""))
    order_files = get_order_files(order.get("id", ""))
    progress = _progress_from_companies(companies)
    client_data = order.get("client") if isinstance(order.get("client"), dict) else {}

    return {
        "id": order.get("id"),
        "order_number": order.get("order_number"),
        "client_id": order.get("client_id"),
        "client": {
            "client_name": client_data.get("client_name") or _client_name_from_order(order),
            "valyze_id": client_data.get("valyze_id"),
            "email": client_data.get("email"),
            # Self-hiding in the rendered document if the clients table has no
            # such columns — _row() drops empty values.
            "vat_no": client_data.get("vat_no"),
            "address": client_data.get("address"),
        },
        "client_ref": order.get("client_ref"),
        "date_received": order.get("date_received"),
        "service_level": order.get("service_level"),
        "due_date": order.get("due_date"),
        "report_type": order.get("report_type"),
        "status": order.get("status"),
        "company_count": order.get("company_count", progress["total"]),
        "completed_count": order.get("completed_count", progress["completed"]),
        "auto_assigned_analyst": order.get("auto_assigned_analyst"),
        "notes": order.get("notes"),
        "submitted_via_portal": order.get("submitted_via_portal", False),
        "companies": [_public_company(company) for company in companies],
        "files": [_public_order_file(file) for file in order_files],
        "invoice": invoice,
        "progress": progress,
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
    }


def _get_order_or_404(order_id: str) -> Dict[str, Any]:
    order = sb_get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _get_company_or_404(order_id: str, company_id: str) -> Dict[str, Any]:
    company = sb_get_order_company(company_id)
    if not company or company.get("order_id") != order_id:
        raise HTTPException(status_code=404, detail="Company not found in this order")
    return company


def _trigger_invoice_creation(order: Dict[str, Any], companies: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Create the order's draft invoice (or return the one that exists).

    Returns None when no invoice could be created. A pricing failure is NOT
    papered over with a $0 invoice: it is logged and skipped, so an admin can
    create a correct one later from /invoices/generate.
    """
    existing = sb_get_order_invoice(order.get("id", ""))
    if existing:
        return existing

    # Get the client to pass into pricing engine
    client = get_client(order.get("client_id", "")) or {}
    existing_invoices = []
    try:
        from services.supabase_client import get_all_invoices as sb_get_all_invoices
        existing_invoices = sb_get_all_invoices({"client_id": client.get("id")})
    except Exception:
        pass

    # Build pricing inputs
    pricing_order = dict(order)
    pricing_order["companies"] = companies or []
    pricing_order["company_count"] = len(companies or []) or order.get("company_count")
    pricing_client = dict(client)
    pricing_client["invoice_count"] = len(existing_invoices)

    try:
        pricing = calculate_invoice(pricing_order, pricing_client)
    except Exception as exc:
        logger.error(
            f"[ORDERS] Pricing failed for order {order.get('id')} — no invoice created; "
            f"generate it from the order page once pricing is fixed: {exc}",
            exc_info=True,
        )
        return None

    # Build properly priced invoice payload (the number is allocated, with
    # collision retry, by create_numbered_invoice).
    payload = {
        "id": str(uuid.uuid4()),
        "order_id": order.get("id"),
        "client_id": order.get("client_id"),
        "service_level": order.get("service_level"),
        "report_type": order.get("report_type"),
        "company_count": pricing.get("company_count"),
        "unit_price": pricing.get("unit_price"),
        "subtotal": pricing.get("subtotal"),
        "is_pilot": pricing.get("is_pilot", False),
        "volume_discount_pct": pricing.get("volume_discount_pct", 0),
        "discount_amount": pricing.get("discount_amount"),
        "total": pricing.get("total"),
        "currency": pricing.get("currency", "USD"),
        "line_items": pricing.get("line_items", []),
        "status": "draft",
        "notes": "Auto-generated when order was marked completed.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        return create_numbered_invoice(payload)
    except Exception as exc:
        logger.error(
            f"[ORDERS] Invoice creation FAILED for order {order.get('id')}: {exc}",
            exc_info=True,
        )
        return None


def _finish_order(order_id: str, order: Dict[str, Any], companies: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Mark a fully-completed order completed, create its invoice and, when the
    invoice exists, move the order to "invoiced" (the status the rest of the app
    — delete/cancel guards, /invoices/generate, the UI — reads as "billed")."""
    progress = _progress_from_companies(companies)
    now = datetime.now(timezone.utc).isoformat()
    order_updates: Dict[str, Any] = {
        "status": "completed",
        "completed_count": progress["completed"],
        "company_count": progress["total"],
        "updated_at": now,
    }
    updated = sb_update_order(order_id, order_updates) or {**order, **order_updates}
    invoice = _trigger_invoice_creation(updated, companies)
    if invoice:
        invoiced = sb_update_order(order_id, {"status": "invoiced", "updated_at": now})
        updated = invoiced or {**updated, "status": "invoiced"}
    return updated


def _complete_order_if_ready(
    order_id: str, companies: Optional[List[Dict[str, Any]]] = None
) -> tuple[Dict[str, int], Optional[str]]:
    """Close the order once every company is completed.

    Returns (progress, order_status). A cancelled or invoiced order is never
    reopened or re-invoiced from here.
    """
    companies = companies if companies is not None else sb_get_order_companies(order_id)
    progress = _progress_from_companies(companies)
    order = _get_order_or_404(order_id)
    status = order.get("status")
    if status in CLOSED_ORDER_STATUSES:
        return progress, status
    if progress["total"] == 0 or progress["completed"] < progress["total"]:
        if order.get("completed_count") != progress["completed"]:
            sb_update_order(order_id, {
                "completed_count": progress["completed"],
                "company_count": progress["total"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        return progress, status

    updated = _finish_order(order_id, order, companies)
    return progress, updated.get("status")


@router.get("/companies/")
async def get_all_order_companies(
    status: Optional[str] = None,
    country: Optional[str] = None,
    search: Optional[str] = None,
    limit: Optional[int] = Query(None, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """Get all order companies (reports) flattened with order and client info.

    `status` is a COMPANY status (or "overdue": past the order's due date and
    not completed/cancelled). `limit`/`offset` are optional paging; without
    them the full list (capped server-side) is returned as before.
    """
    if status and status not in COMPANY_STATUS_FILTERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Valid: {', '.join(sorted(COMPANY_STATUS_FILTERS))}",
        )

    try:
        overdue = status == "overdue"
        companies = sb_get_all_order_companies(
            status=None if overdue else status,
            country=country,
            search=search,
            limit=None if overdue else limit,
            offset=0 if overdue else offset,
        )
        if overdue:
            now = datetime.now(timezone.utc)
            companies = [
                c for c in companies
                if c.get("status") not in ("completed", "cancelled")
                and (_parse_datetime(c.get("due_date")) or now) < now
            ]
            if limit:
                companies = companies[offset:offset + limit]
        return companies
    except Exception as exc:
        logger.error(f"[ORDERS] Failed to list order companies: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list order companies")


def _build_company_focus(company: Dict[str, Any]) -> Dict[str, Any]:
    """Focused detail for a single order_company (one report), with its parent
    order + client context and the files relevant to it."""
    order = sb_get_order(company.get("order_id", "")) or {}
    client = order.get("client") if isinstance(order.get("client"), dict) else {}
    company_files = get_order_files(company.get("order_id", ""), company.get("id"))
    order_level_files = [f for f in get_order_files(company.get("order_id", "")) if not f.get("order_company_id")]

    return {
        "id": company.get("id"),
        "order_id": company.get("order_id"),
        "company_name": company.get("company_name"),
        "client_ref": company.get("client_ref"),
        "country": company.get("country"),
        "registration_no": company.get("registration_no"),
        "vat_no": company.get("vat_no"),
        "phone": company.get("phone"),
        "fax": company.get("fax"),
        "address": company.get("address"),
        "requested_limit": company.get("requested_limit"),
        "comments": company.get("comments"),
        "status": company.get("status"),
        "analyst_assigned": company.get("analyst_assigned"),
        "report_id": company.get("report_id"),
        "sort_order": company.get("sort_order", 0),
        "date_assigned": company.get("date_assigned"),
        "created_at": company.get("created_at"),
        "updated_at": company.get("updated_at"),
        "order": {
            "id": order.get("id"),
            "order_number": order.get("order_number"),
            "client_id": order.get("client_id"),
            "client_ref": order.get("client_ref"),
            "service_level": order.get("service_level"),
            "speed": order.get("speed"),
            "report_type": order.get("report_type"),
            "report_types": order.get("report_types"),
            "due_date": order.get("due_date"),
            "date_received": order.get("date_received"),
            "status": order.get("status"),
            "notes": order.get("notes"),
            "submitted_via_portal": order.get("submitted_via_portal", False),
            "company_count": order.get("company_count"),
        },
        "client": {
            "client_name": client.get("client_name") or order.get("client_name"),
            "valyze_id": client.get("valyze_id"),
            "email": client.get("email"),
        },
        "files": [_public_order_file(f) for f in (company_files + order_level_files)],
    }


@router.get("/companies/{company_id}")
async def get_company_focus(company_id: str, user: dict = Depends(get_current_user)):
    """Focused single-report view for the Orders page."""
    company = sb_get_order_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Order not found")
    return _build_company_focus(company)


@router.delete("/companies/{company_id}")
async def delete_company_focus(company_id: str, user: dict = Depends(get_current_user)):
    """Delete a single focused report (order_company). Completed reports are
    protected; a linked report row is cleaned up and the parent order counts
    are recomputed from the remaining companies."""
    require_admin(user)
    company = sb_get_order_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(company.get("status") or "").lower() == "completed":
        raise HTTPException(status_code=409, detail="Completed reports cannot be deleted")

    order_id = company.get("order_id")
    report_id = company.get("report_id")

    deleted = sb_delete_order_company(company_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete order")

    if report_id:
        try:
            from services.supabase_client import delete_report as sb_delete_report
            sb_delete_report(report_id)
        except Exception as exc:
            logger.warning(f"[ORDERS] Could not clean up report {report_id} for deleted company {company_id}: {exc}")

    if order_id:
        remaining = sb_get_order_companies(order_id)
        progress = _progress_from_companies(remaining)
        sb_update_order(order_id, {
            "company_count": progress["total"],
            "completed_count": progress["completed"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    return {"deleted": True, "company_id": company_id, "order_id": order_id}


@router.get("/", response_model=List[dict])
async def list_orders(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    analyst: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    if status:
        _validate_status(status)

    try:
        orders = sb_get_all_orders(status=status, client_id=client_id, analyst=analyst)
    except Exception as exc:
        logger.error(f"[ORDERS] Failed to list orders: {exc}")
        raise HTTPException(status_code=500, detail="Failed to list orders")

    return [_public_order_summary(order) for order in orders]


@router.post("/", response_model=dict)
async def create_order(body: CreateOrderRequest, user: dict = Depends(get_current_user)):
    if body.service_level not in VALID_SERVICE_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid service_level '{body.service_level}'. "
            f"Valid: {', '.join(sorted(VALID_SERVICE_LEVELS))}",
        )
    if body.report_type not in VALID_REPORT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid report_type '{body.report_type}'. "
            f"Valid: {', '.join(sorted(VALID_REPORT_TYPES))}",
        )

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "id": str(uuid.uuid4()),
        "order_number": generate_order_number(),
        "client_id": body.client_id,
        "client_ref": body.client_ref,
        "date_received": now,
        "service_level": body.service_level,
        "due_date": body.due_date,
        "report_type": body.report_type,
        "status": "pending",
        "company_count": 0,
        "completed_count": 0,
        "auto_assigned_analyst": assign_analyst(),
        "notes": body.notes,
        "submitted_via_portal": False,
        "created_at": now,
        "updated_at": now,
    }

    try:
        created = sb_create_order(payload)
        if not created:
            raise HTTPException(status_code=500, detail="Failed to create order")
        return _public_order_summary(created)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[ORDERS] Failed to create order: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create order")


@router.get("/analysts")
async def list_assignable_analysts(user: dict = Depends(get_current_user)):
    """Users an order or company can be assigned to (any staff may read this).

    Registered before the `/{order_id}` routes so "analysts" is not taken as
    an order id.
    """
    assignable = {email.lower() for email in get_order_assignable_users()}
    analysts = [
        {"email": u.get("email"), "name": u.get("name"), "role": u.get("role")}
        for u in list_users()
        if str(u.get("email") or "").lower() in assignable
    ]
    analysts.sort(key=lambda a: (str(a.get("name") or "").lower(), str(a.get("email") or "")))
    return {"analysts": analysts}


def _validated_analyst(value: Any) -> str:
    """Return the assignable user's email for `value`, or 400."""
    email = str(value or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Analyst email is required")
    assignable = get_order_assignable_users()
    by_lower = {a.lower(): a for a in assignable}
    match = by_lower.get(email.lower())
    if match is None:
        raise HTTPException(status_code=400, detail=f"Invalid analyst. Valid: {', '.join(assignable)}")
    return match


@router.get("/{order_id}")
async def get_order_detail(order_id: str, user: dict = Depends(get_current_user)):
    order = _get_order_or_404(order_id)
    return _build_order_detail(order)


def _order_summary_text(order: Dict[str, Any], companies: List[Dict[str, Any]], client: Dict[str, Any]) -> str:
    """Human-readable summary of everything the client submitted for this order."""
    lines: List[str] = []
    lines.append("VALYZE — CLIENT ORDER SUBMISSION")
    lines.append("=" * 48)
    lines.append(f"Order Number : {order.get('order_number') or order.get('id')}")
    lines.append(f"Status       : {order.get('status')}")
    lines.append(f"Client       : {client.get('client_name') or order.get('client_name') or '-'}")
    if client.get("valyze_id"):
        lines.append(f"Client ID    : {client.get('valyze_id')}")
    if order.get("client_ref"):
        lines.append(f"Client Ref   : {order.get('client_ref')}")
    lines.append(f"Service Level: {order.get('service_level')}")
    lines.append(f"Report Type  : {order.get('report_type')}")
    lines.append(f"Date Received: {order.get('date_received')}")
    lines.append(f"Due Date     : {order.get('due_date')}")
    lines.append(f"Analyst      : {order.get('auto_assigned_analyst') or '-'}")
    lines.append(f"Submitted via portal: {order.get('submitted_via_portal', False)}")
    if order.get("notes"):
        lines.append("")
        lines.append("Notes:")
        lines.append(str(order.get("notes")))
    lines.append("")
    lines.append(f"COMPANIES ({len(companies)})")
    lines.append("-" * 48)
    for idx, company in enumerate(companies, start=1):
        lines.append(f"{idx}. {company.get('company_name') or 'Unnamed company'}")
        for label, key in (
            ("Country", "country"),
            ("Registration No", "registration_no"),
            ("VAT No", "vat_no"),
            ("Phone", "phone"),
            ("Address", "address"),
            ("Requested Limit", "requested_limit"),
            ("Status", "status"),
            ("Comments", "comments"),
        ):
            value = company.get(key)
            if value:
                lines.append(f"     {label}: {value}")
        lines.append("")
    return "\n".join(lines)


@router.get("/{order_id}/download")
async def download_order(order_id: str, user: dict = Depends(get_current_user)):
    """Download everything the client submitted for an order as a single ZIP:
    a readable summary, the raw JSON, and every attached file (pulled from
    Supabase Storage — no reliance on the ephemeral local disk)."""
    order = _get_order_or_404(order_id)
    companies = sb_get_order_companies(order_id)
    client = get_client(order.get("client_id", "")) or {}
    files = get_order_files(order_id)

    # Vercel cannot return a response over ~4.5 MB. Refuse up front (from the
    # recorded sizes) rather than download everything and fail opaquely.
    declared = sum(int(f.get("file_size") or 0) for f in files)
    if declared > ZIP_MAX_BYTES:
        raise HTTPException(status_code=413, detail=_ZIP_TOO_LARGE.format(order_id=order_id))

    order_label = order.get("order_number") or order.get("id") or "order"
    safe_label = re.sub(r"[^\w\-]+", "_", str(order_label)).strip("_") or "order"

    detail = _build_order_detail(order, companies=companies)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        # The styled order document, not raw JSON — same renderer the client
        # receives. The browser turns it into a PDF (Print -> Save as PDF), which
        # keeps Arabic/RTL company names correct; a server-side PDF lib would not.
        archive.writestr(f"{safe_label}/{safe_label}.html", build_order_html(detail))
        archive.writestr(
            f"{safe_label}/README.txt",
            "Open the .html file in any browser, then Print -> Save as PDF.\n"
            "The attached client documents are in the files/ folder.\n",
        )

        used_names: Dict[str, int] = {}
        for file in files:
            file_path = file.get("file_path", "") or ""
            filename = file.get("filename") or "attachment"
            content: Optional[bytes] = None
            if file_path.startswith("storage://"):
                storage_ref = file_path[len("storage://"):]
                parts = storage_ref.split("/", 1)
                if len(parts) == 2:
                    content = download_from_storage(parts[0], parts[1])
            elif file_path:
                try:
                    disk_path = Path(file_path)
                    if disk_path.exists():
                        content = disk_path.read_bytes()
                except OSError:
                    content = None
            if not content:
                continue
            # Avoid collisions when two companies submit the same filename.
            arc_name = filename
            if arc_name in used_names:
                used_names[arc_name] += 1
                stem, suffix = Path(arc_name).stem, Path(arc_name).suffix
                arc_name = f"{stem} ({used_names[filename]}){suffix}"
            else:
                used_names[arc_name] = 0
            archive.writestr(f"{safe_label}/files/{arc_name}", content)

    content = buffer.getvalue()
    if len(content) > ZIP_MAX_BYTES:
        raise HTTPException(status_code=413, detail=_ZIP_TOO_LARGE.format(order_id=order_id))
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": content_disposition(f"{safe_label}.zip")},
    )


_ZIP_TOO_LARGE = (
    "This order's files are too large to download as one ZIP (the server limit is about 4 MB). "
    "Download the files individually: GET /api/orders/{order_id}/files returns a link for each."
)


@router.get("/{order_id}/files")
async def order_file_links(order_id: str, user: dict = Depends(get_current_user)):
    """Short-lived signed Storage URLs for every file of an order — the way to
    fetch large submissions, which do not fit in one serverless response."""
    _get_order_or_404(order_id)
    links = []
    for file in get_order_files(order_id):
        file_path = file.get("file_path", "") or ""
        url = None
        if file_path.startswith("storage://"):
            parts = file_path[len("storage://"):].split("/", 1)
            if len(parts) == 2:
                url = create_signed_url(parts[0], parts[1], expires_in=600)
        links.append({
            "id": file.get("id"),
            "order_company_id": file.get("order_company_id"),
            "filename": file.get("filename"),
            "file_size": file.get("file_size", 0),
            "url": url,
            "expires_in": 600 if url else None,
        })
    return {"order_id": order_id, "files": links}


@router.get("/{order_id}/document")
async def order_document(
    order_id: str,
    format: str = "html",
    user: dict = Depends(get_current_user),
):
    """Order details as a printable HTML doc (format=html, default) or a Word
    file (format=doc). PDF is produced client-side from the HTML (browser
    print), so any language — including Arabic company names — renders correctly."""
    order = _get_order_or_404(order_id)
    detail = _build_order_detail(order)
    html = build_order_html(detail)
    order_no = detail.get("order_number") or order_id
    if format == "doc":
        return Response(
            content=html,
            media_type=WORD_MIME,
            headers={"Content-Disposition": content_disposition(f"Order-{order_no}.doc")},
        )
    return HTMLResponse(content=html)


def check_status_transition(current: Optional[str], target: str) -> None:
    """Raise 409 unless ORDER_STATUS_TRANSITIONS allows current → target."""
    _validate_status(target)
    current = current if current in ORDER_STATUS_TRANSITIONS else "pending"
    if target == current:
        return
    allowed = ORDER_STATUS_TRANSITIONS[current]
    if target not in allowed:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot change an order from '{current}' to '{target}'. "
                f"Allowed: {', '.join(sorted(allowed)) or 'none'}"
            ),
        )


@router.patch("/{order_id}")
async def update_order(order_id: str, body: UpdateOrderRequest, user: dict = Depends(get_current_user)):
    existing = _get_order_or_404(order_id)
    updates = _model_dump(body)
    if not updates:
        return _build_order_detail(existing)

    # Status, counters, analyst and service level are admin decisions.
    if {"status", "company_count", "completed_count", "auto_assigned_analyst", "service_level"} & set(updates):
        require_admin(user)

    if "service_level" in updates and updates["service_level"] not in VALID_SERVICE_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid service_level. Valid: {', '.join(sorted(VALID_SERVICE_LEVELS))}",
        )
    if "report_type" in updates and updates["report_type"] not in VALID_REPORT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid report_type. Valid: {', '.join(sorted(VALID_REPORT_TYPES))}",
        )
    if "auto_assigned_analyst" in updates:
        updates["auto_assigned_analyst"] = _validated_analyst(updates["auto_assigned_analyst"])

    companies = sb_get_order_companies(order_id)
    progress = _progress_from_companies(companies)

    # Counters are always derived from the companies — never taken from the
    # request. Sending them just triggers a recount.
    if "company_count" in updates or "completed_count" in updates or "status" in updates:
        updates["company_count"] = progress["total"]
        updates["completed_count"] = progress["completed"]

    current_status = existing.get("status")
    target_status = updates.get("status")
    finishing = False
    if target_status is not None:
        check_status_transition(current_status, target_status)
        if target_status != current_status:
            if target_status == "completed":
                if progress["total"] == 0 or progress["completed"] < progress["total"]:
                    raise HTTPException(
                        status_code=409,
                        detail="Every company must be completed before the order can be completed.",
                    )
                finishing = True
            # Never leave "completed" or cancel once an invoice exists.
            if current_status == "completed" or target_status == "cancelled":
                if sb_get_order_invoice(order_id):
                    raise HTTPException(
                        status_code=409,
                        detail="This order already has an invoice and cannot be reopened or cancelled.",
                    )

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        updated = sb_update_order(order_id, updates)
        if not updated:
            raise HTTPException(status_code=404, detail="Order not found")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[ORDERS] Failed to update order: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update order")

    if target_status == "cancelled" and current_status != "cancelled":
        _cancel_open_companies(companies)
        companies = sb_get_order_companies(order_id)
    if finishing:
        # Creates the invoice only now that every company is done, and moves
        # the order to "invoiced" when it succeeds.
        updated = _finish_order(order_id, updated, companies)

    return _build_order_detail(updated, companies=companies)


def _cancel_open_companies(companies: List[Dict[str, Any]]) -> None:
    for company in companies:
        if company.get("status") in ("pending", "in_progress"):
            sb_update_order_company(company["id"], {
                "status": "cancelled",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })


@router.patch("/{order_id}/companies/{company_id}")
async def update_order_company(
    order_id: str,
    company_id: str,
    body: UpdateCompanyRequest,
    user: dict = Depends(get_current_user),
):
    _get_order_or_404(order_id)
    _get_company_or_404(order_id, company_id)

    updates = _model_dump(body)
    if not updates:
        return _public_company(_get_company_or_404(order_id, company_id))

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        updated = sb_update_order_company(company_id, updates)
        if not updated:
            raise HTTPException(status_code=404, detail="Company not found in this order")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[ORDERS] Failed to update order company: {exc}")
        raise HTTPException(status_code=500, detail="Failed to update order company")

    return _public_company(updated)


@router.post("/{order_id}/companies/{company_id}/start")
async def start_company_work(order_id: str, company_id: str, user: dict = Depends(get_current_user)):
    order = _get_order_or_404(order_id)
    company = _get_company_or_404(order_id, company_id)
    _ensure_open_for_work(order, company)

    if company.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Company work is already completed")

    # Idempotency check: if report already linked, return it
    if company.get("report_id"):
        logger.info(f"[ORDERS] Company {company_id} already has report {company['report_id']} — returning existing")
        return {
            "report_id": company["report_id"],
            "redirect_url": f"/extractor/{company['report_id']}",
        }

    report_id = str(uuid.uuid4())
    company_name = company.get("company_name", "Unknown Company")
    country = company.get("country", "")
    registration_no = company.get("registration_no", "")

    # Attempt to create the report and link it atomically
    report_created = False
    try:
        # Step a: Create the report row
        await create_report(None, report_id)
        report_created = True

        now = datetime.now(timezone.utc)
        await update_report_field(None, report_id, "report_date", now.strftime("%Y-%m-%d"), "high", "system")
        await update_report_field(None, report_id, "current_year", str(now.year), "high", "system")
        await update_report_field(None, report_id, "company_name", company_name, "high", "system")
        if country:
            await update_report_field(None, report_id, "country", country, "high", "system")
        if registration_no:
            await update_report_field(None, report_id, "cr_number", registration_no, "high", "system")

        client_name = _client_name_from_order(order)
        if client_name:
            await update_report_field(None, report_id, "client_name", client_name, "high", "system")

        analyst = company.get("analyst_assigned") or order.get("auto_assigned_analyst")
        if analyst:
            await update_report_field(None, report_id, "analyst_name", analyst, "high", "system")
        await update_report_status(None, report_id, "uploading")

        # Step a1: Copy portal files to the report (if any were uploaded via portal)
        company_portal_files = get_order_files(order_id, company_id)
        order_portal_files = get_order_files(order_id)
        all_portal_files = company_portal_files + [f for f in order_portal_files if not f.get("order_company_id")]

        if all_portal_files:
            logger.info(f"[ORDERS] Linking {len(all_portal_files)} portal file(s) to report {report_id}")
            file_type_map = {
                ".pdf": "pdf",
                ".docx": "word",
                ".doc": "word",
                ".png": "image",
                ".jpg": "image",
                ".jpeg": "image",
                ".tiff": "image",
                ".xlsx": "spreadsheet",
                ".xls": "spreadsheet",
                ".csv": "spreadsheet",
                ".txt": "text",
            }
            for pf in all_portal_files:
                file_path = pf.get("file_path", "")
                if not file_path:
                    continue
                safe_name = _sanitize_filename(pf.get("filename", "portal_file"))
                ext = Path(safe_name).suffix.lower()
                file_type = file_type_map.get(ext, "unknown")
                # Store the storage path directly — served via /api/upload/download
                await add_uploaded_file(
                    None,
                    report_id=report_id,
                    filename=safe_name,
                    file_path=file_path,
                    file_type=file_type,
                    file_size=pf.get("file_size", 0),
                )

        # Step b: Link report to company — conditionally, only while no report
        # is linked, so two concurrent "start" clicks cannot both link one.
        updated_company = sb_update_order_company(
            company_id,
            {
                "report_id": report_id,
                "status": "in_progress",
                "date_assigned": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            extra_filters={"report_id": "is.null"},
        )
        if not updated_company:
            # Compensating transaction: delete the orphaned report
            try:
                from services.supabase_client import delete_report as sb_delete_report
                sb_delete_report(report_id)
            except Exception as cleanup_err:
                logger.error(f"[ORDERS] Failed to clean up orphaned report {report_id}: {cleanup_err}")
            winner = sb_get_order_company(company_id) or {}
            if winner.get("report_id"):
                # Another request linked a report first — hand back that one.
                logger.info(f"[ORDERS] Company {company_id} was started concurrently; using report {winner['report_id']}")
                return {
                    "report_id": winner["report_id"],
                    "redirect_url": f"/extractor/{winner['report_id']}",
                }
            logger.error(f"[ORDERS] Failed to link report {report_id} to company {company_id} — rolled back report creation")
            raise HTTPException(status_code=500, detail="Failed to link report to company — report was rolled back")

        # Step c: Update order status if pending
        if order.get("status") == "pending":
            companies = sb_get_order_companies(order_id)
            sb_update_order(
                order_id,
                {
                    "status": "in_progress",
                    "company_count": len(companies),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )

        # Verify the link was set (final safety check)
        verify_company = sb_get_order_company(company_id)
        if not verify_company or verify_company.get("report_id") != report_id:
            logger.error(f"[ORDERS] Verification failed: company {company_id} does not have report_id {report_id}")
            # Clean up orphaned report
            try:
                from services.supabase_client import delete_report as sb_delete_report
                sb_delete_report(report_id)
            except Exception as cleanup_err:
                logger.error(f"[ORDERS] Failed to clean up after verification failure: {cleanup_err}")
            raise HTTPException(status_code=500, detail="Failed to verify report-company link — please retry")

        return {
            "report_id": report_id,
            "redirect_url": f"/extractor/{report_id}",
        }
    except HTTPException:
        raise
    except Exception as exc:
        # If we created the report but linking failed, clean up
        if report_created:
            try:
                from services.supabase_client import delete_report as sb_delete_report
                sb_delete_report(report_id)
                logger.info(f"[ORDERS] Cleaned up orphaned report {report_id} after error: {exc}")
            except Exception as cleanup_err:
                logger.error(f"[ORDERS] Failed to clean up orphaned report {report_id}: {cleanup_err}")
        logger.error(f"[ORDERS] Failed to start work on order {order_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to start work")


@router.post("/{order_id}/companies/{company_id}/complete")
async def complete_company_work(order_id: str, company_id: str, user: dict = Depends(get_current_user)):
    order = _get_order_or_404(order_id)
    company = _get_company_or_404(order_id, company_id)
    _ensure_open_for_work(order, company)
    if company.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Company work is already completed")

    updated_company = sb_update_order_company(
        company_id,
        {
            "status": "completed",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if not updated_company:
        raise HTTPException(status_code=500, detail="Failed to complete company")

    companies = sb_get_order_companies(order_id)
    progress, order_status = _complete_order_if_ready(order_id, companies)

    return {
        "company": _public_company(updated_company),
        "order_id": order_id,
        "progress": progress,
        "order_status": order_status,
    }


def _ensure_open_for_work(order: Dict[str, Any], company: Dict[str, Any]) -> None:
    """Refuse workflow actions on a cancelled/invoiced order or a cancelled company."""
    status = order.get("status")
    if status in CLOSED_ORDER_STATUSES:
        raise HTTPException(status_code=409, detail=f"This order is {status}; its companies can no longer be worked on.")
    if company.get("status") == "cancelled":
        raise HTTPException(status_code=409, detail="This company was cancelled.")


@router.delete("/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(get_current_user)):
    require_admin(user)
    order = _get_order_or_404(order_id)
    # An invoice row is the real "billed" signal — also catches orders whose
    # status was never moved to invoiced. Deleting would orphan the invoice.
    if str(order.get("status") or "").lower() == "invoiced" or sb_get_order_invoice(order_id):
        raise HTTPException(
            status_code=409,
            detail="Invoiced orders cannot be deleted.",
        )

    # Cascade: remove every company + its linked report before the order itself.
    companies = sb_get_order_companies(order_id)
    for company in companies:
        report_id = company.get("report_id")
        if report_id:
            try:
                from services.supabase_client import delete_report as sb_delete_report
                sb_delete_report(report_id)
            except Exception as exc:
                logger.warning(f"[ORDERS] Could not clean up report {report_id} for order {order_id}: {exc}")
        sb_delete_order_company(company["id"])

    deleted = sb_delete_order(order_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete order")

    return {"deleted": True, "order_id": order_id, "companies_deleted": len(companies)}


@router.post("/{order_id}/reassign")
async def reassign_order(
    order_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Reassign an order (all companies) to a different analyst."""
    require_admin(user)
    _get_order_or_404(order_id)
    analyst = _validated_analyst(body.get("analyst"))

    # Update all companies in the order
    companies = sb_get_order_companies(order_id)
    for company in companies:
        sb_update_order_company(company["id"], {
            "analyst_assigned": analyst,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    # Update order's auto_assigned_analyst
    sb_update_order(order_id, {
        "auto_assigned_analyst": analyst,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "order_id": order_id,
        "reassigned_to": analyst,
        "companies_updated": len(companies),
        "message": f"Order reassigned to {analyst}",
    }


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: str,
    user: dict = Depends(get_current_user),
):
    """Cancel an order. Sets status to 'cancelled'. Admin only (a status change)."""
    require_admin(user)
    order = _get_order_or_404(order_id)
    if order.get("status") in ("completed", "invoiced", "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel order with status '{order.get('status')}'",
        )
    if sb_get_order_invoice(order_id):
        raise HTTPException(status_code=409, detail="This order already has an invoice and cannot be cancelled.")

    updated = sb_update_order(order_id, {
        "status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    if not updated:
        raise HTTPException(status_code=404, detail="Order not found")

    # Also cancel all pending companies
    _cancel_open_companies(sb_get_order_companies(order_id))

    return {
        "order_id": order_id,
        "status": "cancelled",
        "message": "Order has been cancelled",
    }


@router.post("/{order_id}/reassign-company/{company_id}")
async def reassign_company(
    order_id: str,
    company_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Reassign a single company/report to a different analyst."""
    require_admin(user)
    _get_order_or_404(order_id)
    _get_company_or_404(order_id, company_id)
    analyst = _validated_analyst(body.get("analyst"))

    updated = sb_update_order_company(company_id, {
        "analyst_assigned": analyst,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")

    return {
        "company_id": company_id,
        "reassigned_to": analyst,
        "message": f"Company reassigned to {analyst}",
    }


