from __future__ import annotations

import hashlib
import os
import random
import secrets
import string
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Path as PathParam
from pydantic import BaseModel, Field

from api.auth import get_current_user
from services.supabase_client import (
    create_client as create_client_record,
    create_client_session as create_client_session_record,
    delete_client as delete_client_record,
    delete_session as delete_session_record,
    get_all_clients as get_all_client_records,
    get_client as get_client_record,
    get_client_sessions as get_client_session_records,
    get_completed_order_companies_count,
    get_orders_for_client,
    get_orders_for_clients,
    update_client as update_client_record,
)

router = APIRouter(tags=["clients"])

ORDER_FIELDS = (
    "id",
    "order_number",
    "date_received",
    "status",
    "company_count",
    "service_level",
)

SESSION_FIELDS = (
    "id",
    "token",
    "portal_url",
    "expires_at",
    "used_count",
    "max_uses",
    "created_at",
    "no_expiry",
    "disabled",
)

ACTIVE_SESSION_FIELDS = (
    "token",
    "expires_at",
    "used_count",
    "portal_url",
)

PORTAL_URL = (os.getenv("PORTAL_URL") or os.getenv("FRONTEND_URL") or "http://localhost:1573").rstrip("/")
PASSWORD_CHARS = string.ascii_letters + string.digits


class ClientCreate(BaseModel):
    client_name: str
    client_type: Literal["company", "bank", "third_party"]
    contact_person: str
    email: str
    phone: str
    country: str
    address: str
    is_pilot: bool = False
    notes: str = ""


class ClientUpdate(BaseModel):
    client_name: Optional[str] = None
    client_type: Optional[Literal["company", "bank", "third_party"]] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    is_pilot: Optional[bool] = None
    notes: Optional[str] = None


class PortalLinkRequest(BaseModel):
    # By default a portal link never expires and has unlimited uses.
    # It stays active until an admin revokes/disables it from the dashboard.
    no_expiry: bool = True
    max_uses: Optional[int] = Field(default=None, ge=1, le=1000000)
    expiry_days: Optional[int] = Field(default=None, ge=1, le=3650)


# Sentinels for "forever" links
FOREVER_EXPIRES_AT = "2999-12-31T23:59:59+00:00"
UNLIMITED_USES = 1_000_000


def _model_dump(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    digest = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}:{digest}"


def _generate_password_plain() -> str:
    return "".join(random.choice(PASSWORD_CHARS) for _ in range(8))


def _is_valid_session(session: Dict[str, Any]) -> bool:
    # An admin-disabled session is never valid.
    if session.get("disabled"):
        return False

    used_count = int(session.get("used_count") or 0)
    max_uses = int(session.get("max_uses") or 0)
    if max_uses and used_count >= max_uses:
        return False

    # Forever links skip the expiry check entirely.
    if session.get("no_expiry"):
        return True

    expires_at = _parse_datetime(session.get("expires_at"))
    if expires_at is None:
        return False
    return datetime.now(timezone.utc) < expires_at


def _public_order(order: Dict[str, Any]) -> Dict[str, Any]:
    return {field: order.get(field) for field in ORDER_FIELDS}


def _public_sessions(sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            **{field: session.get(field) for field in SESSION_FIELDS},
            "is_valid": _is_valid_session(session),
        }
        for session in sessions
    ]


def _active_sessions(sessions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {field: session.get(field) for field in ACTIVE_SESSION_FIELDS}
        for session in sessions
        if _is_valid_session(session)
    ]


@router.get("/")
async def list_clients(
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    clients = get_all_client_records(search)
    if not clients:
        return []

    client_ids = [str(client["id"]) for client in clients if client.get("id")]
    orders = get_orders_for_clients(client_ids)
    order_counts = Counter(order.get("client_id") for order in orders if order.get("client_id"))
    completed_tasks = Counter()
    total_tasks = Counter()

    for order in orders:
        client_id = str(order.get("client_id"))
        total_tasks[client_id] += int(order.get("company_count") or 0)
        completed_tasks[client_id] += int(order.get("completed_count") or 0)

    return [
        {
            **client,
            "total_orders": order_counts.get(client.get("id"), 0),
            "completed_tasks": completed_tasks.get(client.get("id"), 0),
            "total_tasks": total_tasks.get(client.get("id"), 0),
        }
        for client in clients
    ]


@router.post("/")
async def create_client(
    body: ClientCreate,
    user: dict = Depends(get_current_user),
):
    created = create_client_record(_model_dump(body))
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create client")
    return created


@router.get("/{client_id}")
async def get_client(
    client_id: str = PathParam(..., description="Client unique identifier"),
    user: dict = Depends(get_current_user),
):
    client = get_client_record(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    orders = get_orders_for_client(client_id)
    sessions = get_client_session_records(client_id)
    order_ids = [str(order["id"]) for order in orders if order.get("id")]
    total_reports_done = get_completed_order_companies_count(order_ids)

    return {
        **client,
        "orders": [_public_order(order) for order in orders],
        "active_sessions": _active_sessions(sessions),
        "total_reports_done": total_reports_done,
    }


@router.patch("/{client_id}")
async def update_client(
    client_id: str,
    body: ClientUpdate,
    user: dict = Depends(get_current_user),
):
    client = get_client_record(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    updates = _model_dump(body)
    updated = update_client_record(client_id, updates)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to update client")
    return updated


@router.delete("/{client_id}")
async def delete_client(
    client_id: str = PathParam(..., description="Client unique identifier"),
    user: dict = Depends(get_current_user),
):
    client = get_client_record(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if get_orders_for_client(client_id):
        raise HTTPException(
            status_code=409,
            detail="Client has existing orders. Archive instead.",
        )

    deleted = delete_client_record(client_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete client")
    return {"deleted": True, "client_id": client_id}


@router.post("/{client_id}/generate-portal-link")
async def generate_portal_link(
    client_id: str,
    body: Optional[PortalLinkRequest] = Body(default=None),
    user: dict = Depends(get_current_user),
):
    client = get_client_record(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    request = body or PortalLinkRequest()
    token = secrets.token_hex(16)
    password_plain = _generate_password_plain()
    portal_url = f"{PORTAL_URL}/portal?token={token}"

    # A link is "forever" when no_expiry is set or no expiry_days was provided.
    no_expiry = request.no_expiry or request.expiry_days is None
    if no_expiry:
        expires_at_iso = FOREVER_EXPIRES_AT
    else:
        expires_at_iso = (datetime.now(timezone.utc) + timedelta(days=request.expiry_days)).isoformat()

    # None max_uses means unlimited.
    max_uses = request.max_uses if request.max_uses is not None else UNLIMITED_USES

    session = create_client_session_record(
        {
            "client_id": client_id,
            "token": token,
            "password_hash": _hash_password(password_plain),
            "password_plain_temp": password_plain,
            "portal_url": portal_url,
            "expires_at": expires_at_iso,
            "no_expiry": no_expiry,
            "disabled": False,
            "used_count": 0,
            "max_uses": max_uses,
        }
    )
    if not session:
        raise HTTPException(status_code=500, detail="Failed to create client session")

    return {
        "token": session.get("token"),
        "password_plain": password_plain,
        "portal_url": portal_url,
        "expires_at": None if no_expiry else (session.get("expires_at") or expires_at_iso),
        "no_expiry": no_expiry,
        "session_id": session.get("id"),
    }


@router.get("/{client_id}/sessions")
async def get_client_sessions(
    client_id: str,
    user: dict = Depends(get_current_user),
):
    client = get_client_record(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    return _public_sessions(get_client_session_records(client_id))


@router.delete("/sessions/{session_id}")
async def delete_client_session(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    deleted = delete_session_record(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True, "session_id": session_id}


@router.post("/sessions/{session_id}/reset-password")
async def reset_session_password(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """Reset the password for a portal session without changing the link."""
    from services.supabase_client import get_session as sb_get_session
    session = sb_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    password_plain = _generate_password_plain()
    new_hash = _hash_password(password_plain)

    from services.supabase_client import update_session as sb_update_session
    sb_update_session(session_id, {
        "password_hash": new_hash,
        "password_plain_temp": password_plain,
    })

    return {
        "session_id": session_id,
        "new_password": password_plain,
        "message": "Password has been reset",
    }


@router.post("/sessions/{session_id}/toggle-disable")
async def toggle_disable_session(
    session_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Enable or disable a portal session temporarily without deleting the link."""
    from services.supabase_client import get_session as sb_get_session
    session = sb_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    disabled = body.get("disabled", True)

    from services.supabase_client import update_session as sb_update_session
    sb_update_session(session_id, {"disabled": disabled})

    return {
        "session_id": session_id,
        "disabled": disabled,
        "message": f"Session has been {'disabled' if disabled else 'enabled'}",
    }


@router.post("/sessions/{session_id}/set-no-expiry")
async def set_session_no_expiry(
    session_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Set/unset no-expiry flag on session."""
    from services.supabase_client import get_session as sb_get_session
    session = sb_get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    no_expiry = body.get("no_expiry", True)

    from services.supabase_client import update_session as sb_update_session
    sb_update_session(session_id, {"no_expiry": no_expiry})

    return {
        "session_id": session_id,
        "no_expiry": no_expiry,
        "message": f"No-expiry set to {no_expiry}",
    }
