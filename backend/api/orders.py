"""
Orders API — Manages client orders and their associated order_companies.

An order is a batch of companies submitted by a client for credit report generation.
Each order_company becomes one Valyze report.
"""

from __future__ import annotations

import uuid
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import get_current_user, get_order_assignable_users
from database.crud import add_uploaded_file, create_report, update_report_field, update_report_status
import logging
from services.supabase_client import (
    create_invoice as sb_create_invoice,
    create_order as sb_create_order,
    delete_order as sb_delete_order,
    download_from_storage,
    get_all_orders as sb_get_all_orders,
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

VALID_STATUSES = {"pending", "in_progress", "completed", "invoiced"}
VALID_COMPANY_STATUSES = {"pending", "in_progress", "completed"}
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
    status: Optional[str] = None
    analyst_assigned: Optional[str] = None
    report_id: Optional[str] = None
    company_name: Optional[str] = None
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

    workload: Dict[str, int] = {email: 0 for email in assignable_users}
    for row in workload_rows:
        email = row.get("auto_assigned_analyst")
        if email not in assignable_users:
            continue
        count = row.get("count") or row.get("count:id") or 0
        try:
            workload[email] = int(count)
        except (TypeError, ValueError):
            workload[email] = 0

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


def generate_order_number() -> str:
    now = datetime.now(timezone.utc)
    year = now.year
    max_seq = get_max_order_number(year) or 0
    return f"ORD-{year}-{max_seq + 1:04d}"


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
        "country": company.get("country"),
        "registration_no": company.get("registration_no"),
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
    pricing_client = dict(client)
    pricing_client["invoice_count"] = len(existing_invoices)

    # Use the pricing engine to calculate proper values
    try:
        pricing = calculate_invoice(pricing_order, pricing_client)
    except Exception as exc:
        print(f"[ORDERS] Pricing calculation failed for order {order.get('id')}: {exc}")
        # Fallback to a basic invoice without pricing
        payload = {
            "id": str(uuid.uuid4()),
            "invoice_number": generate_invoice_number(),
            "order_id": order.get("id"),
            "client_id": order.get("client_id"),
            "service_level": order.get("service_level"),
            "report_type": order.get("report_type"),
            "company_count": order.get("company_count") or len(companies),
            "unit_price": 0,
            "subtotal": 0,
            "is_pilot": False,
            "volume_discount_pct": 0,
            "discount_amount": 0,
            "total": 0,
            "currency": "USD",
            "line_items": [],
            "status": "draft",
            "notes": "Auto-generated when order was marked completed.",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            return sb_create_invoice(payload)
        except Exception as exc2:
            print(f"[ORDERS] Fallback invoice creation failed for order {order.get('id')}: {exc2}")
            return None

    # Build properly priced invoice payload
    payload = {
        "id": str(uuid.uuid4()),
        "invoice_number": generate_invoice_number(),
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
        return sb_create_invoice(payload)
    except Exception as exc:
        error_msg = str(exc).lower()
        # Handle unique constraint violation (PostgreSQL error code 23505)
        # This means another concurrent request already created the invoice
        if "23505" in error_msg or "unique" in error_msg or "duplicate" in error_msg:
            logger.info(
                f"[ORDERS] Invoice already exists for order {order.get('id')} "
                f"(concurrent creation detected). Fetching existing."
            )
            existing = sb_get_order_invoice(order.get("id", ""))
            return existing
        logger.error(
            f"[ORDERS] Invoice creation FAILED for order {order.get('id')}: {exc}",
            exc_info=True,
        )
        return None


def _complete_order_if_ready(order_id: str, companies: Optional[List[Dict[str, Any]]] = None) -> Dict[str, int]:
    companies = companies if companies is not None else sb_get_order_companies(order_id)
    progress = _progress_from_companies(companies)
    if progress["completed"] < progress["total"]:
        return progress

    order = _get_order_or_404(order_id)
    order_updates: Dict[str, Any] = {
        "status": "completed",
        "completed_count": progress["completed"],
        "company_count": progress["total"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    updated = sb_update_order(order_id, order_updates) or {**order, **order_updates}
    _trigger_invoice_creation(updated, companies)
    return progress


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
        raise HTTPException(status_code=500, detail=f"Failed to list orders: {exc}")

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
        raise HTTPException(status_code=500, detail=f"Failed to create order: {exc}")


@router.get("/{order_id}")
async def get_order_detail(order_id: str, user: dict = Depends(get_current_user)):
    order = _get_order_or_404(order_id)
    return _build_order_detail(order)


@router.patch("/{order_id}")
async def update_order(order_id: str, body: UpdateOrderRequest, user: dict = Depends(get_current_user)):
    existing = _get_order_or_404(order_id)
    updates = _model_dump(body)
    if not updates:
        return _build_order_detail(existing)

    if "status" in updates:
        _validate_status(updates["status"])
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
    assignable_users = get_order_assignable_users()
    if "auto_assigned_analyst" in updates and updates["auto_assigned_analyst"] not in assignable_users:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid analyst. Valid: {', '.join(assignable_users)}",
        )

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    status_changed_to_completed = updates.get("status") == "completed" and existing.get("status") != "completed"

    try:
        updated = sb_update_order(order_id, updates)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update order")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update order: {exc}")

    companies = sb_get_order_companies(order_id)
    if status_changed_to_completed:
        _trigger_invoice_creation(updated, companies)

    return _build_order_detail(updated, companies=companies)


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

    if "status" in updates:
        _validate_company_status(updates["status"])

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        updated = sb_update_order_company(company_id, updates)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update order company")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update order company: {exc}")

    return _public_company(updated)


@router.post("/{order_id}/companies/{company_id}/start")
async def start_company_work(order_id: str, company_id: str, user: dict = Depends(get_current_user)):
    order = _get_order_or_404(order_id)
    company = _get_company_or_404(order_id, company_id)

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
            logger.info(f"[ORDERS] Copying {len(all_portal_files)} portal file(s) to report {report_id}")
            report_dir = UPLOAD_DIR / report_id
            report_dir.mkdir(parents=True, exist_ok=True)

            for pf in all_portal_files:
                file_path = pf.get("file_path", "")
                # Download file from storage if it's a storage:// path
                if file_path.startswith("storage://"):
                    storage_ref = file_path[len("storage://"):]
                    parts = storage_ref.split("/", 1)
                    if len(parts) == 2:
                        bucket, path = parts
                        file_content = download_from_storage(bucket, path)
                        if file_content:
                            safe_name = _sanitize_filename(pf.get("filename", "portal_file"))
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
                            ext = Path(safe_name).suffix.lower()
                            file_type = file_type_map.get(ext, "unknown")

                            # Save file locally for extraction engine
                            local_path = report_dir / safe_name
                            local_path.write_bytes(file_content)

                            await add_uploaded_file(
                                None,
                                report_id=report_id,
                                filename=safe_name,
                                file_path=str(local_path),
                                file_type=file_type,
                                file_size=len(file_content),
                            )

        # Step b: Link report to company
        updated_company = sb_update_order_company(
            company_id,
            {
                "report_id": report_id,
                "status": "in_progress",
                "date_assigned": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        if not updated_company:
            # Compensating transaction: delete the orphaned report
            logger.error(f"[ORDERS] Failed to link report {report_id} to company {company_id} — rolling back report creation")
            try:
                from services.supabase_client import delete_report as sb_delete_report
                sb_delete_report(report_id)
            except Exception as cleanup_err:
                logger.error(f"[ORDERS] Failed to clean up orphaned report {report_id}: {cleanup_err}")
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
        raise HTTPException(status_code=500, detail=f"Failed to start work: {exc}")


@router.post("/{order_id}/companies/{company_id}/complete")
async def complete_company_work(order_id: str, company_id: str, user: dict = Depends(get_current_user)):
    _get_order_or_404(order_id)
    company = _get_company_or_404(order_id, company_id)
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
    progress = _complete_order_if_ready(order_id, companies)

    return {
        "company": _public_company(updated_company),
        "order_id": order_id,
        "progress": progress,
    }


@router.delete("/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(get_current_user)):
    order = _get_order_or_404(order_id)
    if order.get("status") != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete order with status '{order.get('status')}'. Only pending orders can be deleted.",
        )

    deleted = sb_delete_order(order_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete order")

    return {"deleted": True, "order_id": order_id}