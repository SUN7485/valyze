"""
Orders API — Manages client orders and their associated order_companies.

An order is a batch of companies submitted by a client for credit report generation.
Each order_company becomes one Valyze report.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import get_current_user, get_order_assignable_users
from database.crud import create_report, update_report_field, update_report_status
from services.supabase_client import (
    create_invoice as sb_create_invoice,
    create_order as sb_create_order,
    delete_order as sb_delete_order,
    get_all_orders as sb_get_all_orders,
    get_analyst_workload as sb_get_analyst_workload,
    get_active_order_assignments as sb_get_active_order_assignments,
    get_max_invoice_number,
    get_max_order_number,
    get_order as sb_get_order,
    get_order_company as sb_get_order_company,
    get_order_companies as sb_get_order_companies,
    get_order_invoice as sb_get_order_invoice,
    update_order as sb_update_order,
    update_order_company as sb_update_order_company,
)

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

    Ties rotate through eligible admins/analysts based on the oldest
    active assignment among tied analysts.
    """
    workload_rows = sb_get_analyst_workload()
    active_rows = sb_get_active_order_assignments()

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

    latest_by_analyst: Dict[str, datetime] = {}
    for row in active_rows:
        email = row.get("auto_assigned_analyst")
        if email not in tied:
            continue
        created_at = _parse_datetime(row.get("created_at"))
        if created_at is None:
            continue
        current = latest_by_analyst.get(email)
        if current is None or created_at > current:
            latest_by_analyst[email] = created_at

    if latest_by_analyst:
        last_email = min(latest_by_analyst, key=latest_by_analyst.get)
        last_index = assignable_users.index(last_email)
        for offset in range(1, len(assignable_users) + 1):
            candidate = assignable_users[(last_index + offset) % len(assignable_users)]
            if candidate in tied:
                return candidate

    return tied[0]


def generate_order_number() -> str:
    now = datetime.now(timezone.utc)
    year = now.year
    max_seq = get_max_order_number(year) or 0
    return f"ORD-{year}-{max_seq + 1:04d}"


def generate_invoice_number() -> str:
    now = datetime.now(timezone.utc)
    year = now.year
    max_seq = get_max_invoice_number(year) or 0
    return f"INV-{year}-{max_seq + 1:04d}"


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

    payload = {
        "id": str(uuid.uuid4()),
        "invoice_number": generate_invoice_number(),
        "order_id": order.get("id"),
        "client_id": order.get("client_id"),
        "service_level": order.get("service_level"),
        "report_type": order.get("report_type"),
        "company_count": order.get("company_count") or len(companies),
        "status": "draft",
        "currency": "USD",
        "is_pilot": False,
        "line_items": [],
        "notes": "Auto-generated when order was marked completed.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        return sb_create_invoice(payload)
    except Exception as exc:
        print(f"[ORDERS] Invoice creation failed for order {order.get('id')}: {exc}")
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

    if company.get("report_id"):
        return {
            "report_id": company["report_id"],
            "redirect_url": f"/extractor/{company['report_id']}",
        }

    report_id = str(uuid.uuid4())
    company_name = company.get("company_name", "Unknown Company")
    country = company.get("country", "")
    registration_no = company.get("registration_no", "")

    try:
        await create_report(None, report_id)
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
            raise HTTPException(status_code=500, detail="Failed to link report to company")

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

        return {
            "report_id": report_id,
            "redirect_url": f"/extractor/{report_id}",
        }
    except HTTPException:
        raise
    except Exception as exc:
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
