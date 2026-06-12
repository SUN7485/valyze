"""
Portal authentication and order intake API for external Valyze clients.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

import jwt
import requests
from fastapi import APIRouter, Depends, HTTPException, Path as PathParam
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from api.auth import JWT_ALGORITHM, JWT_SECRET
from api.orders import assign_analyst, generate_order_number
from services.supabase_client import (
    create_order as sb_create_order,
    get_base_url,
    get_headers,
)

router = APIRouter(tags=["portal"])

PORTAL_JWT_EXPIRY_HOURS = 4
security = HTTPBearer(auto_error=False)

SERVICE_LEVELS = {"basic", "standard", "express", "urgent"}
REPORT_TYPES = {"standard", "full"}


class PortalAuthRequest(BaseModel):
    token: str
    password: str


class OrderCompanyRequest(BaseModel):
    company_name: str = Field(..., min_length=1)
    country: Optional[str] = None
    address: Optional[str] = None
    registration_no: Optional[str] = None
    vat_no: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    requested_limit: Optional[str] = None
    comments: Optional[str] = None


class SubmitOrderRequest(BaseModel):
    client_ref: Optional[str] = None
    service_level: Literal["basic", "standard", "express", "urgent"]
    report_type: Literal["standard", "full"] = "standard"
    due_date: date
    notes: Optional[str] = None
    companies: List[OrderCompanyRequest]


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, digest = stored_hash.split(":", 1)
        return hashlib.sha256((salt + password).encode()).hexdigest() == digest
    except (ValueError, AttributeError):
        return False


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _supabase_request(
    method: str,
    path: str,
    json_body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Any:
    response = requests.request(
        method,
        f"{get_base_url()}{path}",
        json=json_body,
        params=params,
        headers=get_headers(),
        timeout=30,
    )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=500,
            detail=f"Supabase request failed ({response.status_code}): {response.text[:200]}",
        )
    if not response.text:
        return None
    return response.json()


def _quote(value: str) -> str:
    return urllib.parse.quote(value)


def _first_result(result: Any) -> Optional[Dict[str, Any]]:
    if isinstance(result, list):
        return result[0] if result else None
    return result


async def _get_session_by_token(token: str) -> Optional[Dict[str, Any]]:
    results = await asyncio.to_thread(
        _supabase_request,
        "GET",
        "/client_sessions",
        params={"token": f"eq.{_quote(token)}"},
    )
    return results[0] if results else None


async def _get_session(session_id: str) -> Optional[Dict[str, Any]]:
    results = await asyncio.to_thread(
        _supabase_request,
        "GET",
        "/client_sessions",
        params={"id": f"eq.{session_id}"},
    )
    return results[0] if results else None


async def _get_client(client_id: str) -> Optional[Dict[str, Any]]:
    results = await asyncio.to_thread(
        _supabase_request,
        "GET",
        "/clients",
        params={"id": f"eq.{client_id}"},
    )
    return results[0] if results else None


async def _update_session(session_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return await asyncio.to_thread(
        _supabase_request,
        "PATCH",
        f"/client_sessions?id=eq.{session_id}",
        json_body=data,
    )


async def _clear_temp_password(session_id: str) -> None:
    await _update_session(session_id, {"password_plain_temp": None})


async def _increment_session_used_count(session_id: str) -> None:
    session = await _get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Portal session not found")
    current_used = int(session.get("used_count") or 0)
    await _update_session(session_id, {"used_count": current_used + 1})


def _public_client(client: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": client.get("id"),
        "valyze_id": client.get("valyze_id"),
        "client_name": client.get("client_name"),
        "client_type": client.get("client_type"),
        "email": client.get("email"),
        "country": client.get("country"),
    }


def _public_session(session: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": session.get("id"),
        "client_id": session.get("client_id"),
        "expires_at": session.get("expires_at"),
        "used_count": session.get("used_count"),
        "max_uses": session.get("max_uses"),
        "created_at": session.get("created_at"),
    }


def create_portal_token(session_id: str, client_id: str) -> str:
    payload = {
        "session_id": session_id,
        "client_id": client_id,
        "type": "portal",
        "exp": datetime.now(timezone.utc) + timedelta(hours=PORTAL_JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_portal_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Portal token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid portal token")


def get_portal_current_client(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict[str, str]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_portal_token(credentials.credentials)
    if payload.get("type") != "portal":
        raise HTTPException(status_code=401, detail="Invalid portal token")

    session_id = payload.get("session_id")
    client_id = payload.get("client_id")
    if not session_id or not client_id:
        raise HTTPException(status_code=401, detail="Invalid portal token")

    return {"session_id": session_id, "client_id": client_id}


async def _load_portal_session(portal_client: Dict[str, str]) -> Dict[str, Any]:
    session = await _get_session(portal_client["session_id"])
    if not session or session.get("client_id") != portal_client["client_id"]:
        raise HTTPException(status_code=401, detail="Invalid portal session")
    return session


def _next_order_number() -> str:
    return generate_order_number()


async def _create_order_company(order_id: str, company: OrderCompanyRequest, index: int) -> None:
    payload = {
        "order_id": order_id,
        "company_name": company.company_name,
        "country": company.country,
        "address": company.address,
        "registration_no": company.registration_no,
        "vat_no": company.vat_no,
        "phone": company.phone,
        "fax": company.fax,
        "requested_limit": company.requested_limit,
        "comments": company.comments,
        "status": "pending",
        "sort_order": index,
    }
    await asyncio.to_thread(
        _supabase_request,
        "POST",
        "/order_companies",
        json_body=payload,
    )


async def _get_order_by_number_for_client(
    order_number: str,
    client_id: str,
) -> Optional[Dict[str, Any]]:
    results = await asyncio.to_thread(
        _supabase_request,
        "GET",
        "/orders",
        params={
            "order_number": f"eq.{_quote(order_number)}",
            "client_id": f"eq.{client_id}",
        },
    )
    return results[0] if results else None


async def _get_order_companies(order_id: str) -> List[Dict[str, Any]]:
    return await asyncio.to_thread(
        _supabase_request,
        "GET",
        "/order_companies",
        params={"order_id": f"eq.{order_id}", "order": "sort_order.asc"},
    )


@router.post("/auth")
async def portal_auth(body: PortalAuthRequest):
    token = body.token.strip()
    password = body.password

    session = await _get_session_by_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid portal token")

    expires_at = _parse_datetime(session.get("expires_at"))
    if expires_at and expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Portal session expired")

    max_uses = session.get("max_uses")
    used_count = int(session.get("used_count") or 0)
    if max_uses is not None and used_count >= int(max_uses):
        raise HTTPException(status_code=401, detail="Portal session has reached its usage limit")

    if not _verify_password(password, session.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid portal password")

    client = await _get_client(session["client_id"])
    if not client:
        raise HTTPException(status_code=401, detail="Client not found")

    await _clear_temp_password(session["id"])

    portal_token = create_portal_token(session["id"], session["client_id"])
    return {
        "portal_token": portal_token,
        "client": {
            "valyze_id": client.get("valyze_id"),
            "client_name": client.get("client_name"),
            "client_type": client.get("client_type"),
        },
    }


@router.get("/me")
async def portal_me(portal_client: Dict[str, str] = Depends(get_portal_current_client)):
    session = await _load_portal_session(portal_client)
    client = await _get_client(portal_client["client_id"])
    if not client:
        raise HTTPException(status_code=401, detail="Client not found")

    return {
        "client": _public_client(client),
        "session": _public_session(session),
    }


@router.post("/submit-order")
async def submit_order(
    body: SubmitOrderRequest,
    portal_client: Dict[str, str] = Depends(get_portal_current_client),
):
    if not body.companies:
        raise HTTPException(status_code=400, detail="At least one company is required")
    if body.service_level not in SERVICE_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid service_level")
    if body.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid report_type")

    session = await _load_portal_session(portal_client)
    max_uses = session.get("max_uses")
    used_count = int(session.get("used_count") or 0)
    if max_uses is not None and used_count >= int(max_uses):
        raise HTTPException(status_code=401, detail="Portal session has reached its usage limit")

    order_number = _next_order_number()
    now = datetime.now(timezone.utc).isoformat()
    analyst = await asyncio.to_thread(assign_analyst)
    order_payload = {
        "order_number": order_number,
        "client_id": portal_client["client_id"],
        "client_ref": body.client_ref,
        "date_received": now,
        "service_level": body.service_level,
        "due_date": f"{body.due_date.isoformat()}T00:00:00Z",
        "report_type": body.report_type,
        "status": "pending",
        "company_count": len(body.companies),
        "completed_count": 0,
        "auto_assigned_analyst": analyst,
        "submitted_via_portal": True,
        "notes": body.notes,
        "created_at": now,
        "updated_at": now,
    }

    order_result = await asyncio.to_thread(sb_create_order, order_payload)
    order = _first_result(order_result)
    if not order:
        raise HTTPException(status_code=500, detail="Failed to create order")

    try:
        for index, company in enumerate(body.companies):
            await _create_order_company(order["id"], company, index)
        await _increment_session_used_count(portal_client["session_id"])
    except Exception:
        raise

    return {
        "order_id": order.get("id"),
        "order_number": order.get("order_number", order_number),
        "company_count": len(body.companies),
        "due_date": body.due_date.isoformat(),
        "message": "Order submitted successfully",
    }


@router.get("/order-status/{order_number}")
async def get_order_status(
    order_number: str = PathParam(..., description="Order number"),
    portal_client: Dict[str, str] = Depends(get_portal_current_client),
):
    order = await _get_order_by_number_for_client(order_number, portal_client["client_id"])
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    companies = await _get_order_companies(order["id"])
    return {
        "order": {
            "id": order.get("id"),
            "order_number": order.get("order_number"),
            "status": order.get("status"),
            "company_count": order.get("company_count"),
            "completed_count": order.get("completed_count"),
            "due_date": order.get("due_date"),
            "created_at": order.get("created_at"),
            "updated_at": order.get("updated_at"),
        },
        "companies": [
            {
                "id": company.get("id"),
                "company_name": company.get("company_name"),
                "status": company.get("status"),
                "sort_order": company.get("sort_order"),
                "created_at": company.get("created_at"),
                "updated_at": company.get("updated_at"),
            }
            for company in companies
        ],
    }
