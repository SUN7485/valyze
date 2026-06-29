"""
Portal authentication and order intake API for external Valyze clients.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import urllib.parse
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import jwt
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Path as PathParam, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from api.auth import JWT_ALGORITHM, JWT_SECRET
from api.orders import assign_analyst, generate_order_number
from services.supabase_client import (
    create_order as sb_create_order,
    create_order_file,
    get_base_url,
    get_headers,
    get_order_files,
    upload_to_storage,
    create_signed_url,
    ensure_storage_bucket,
)

router = APIRouter(tags=["portal"])

PORTAL_JWT_EXPIRY_HOURS = 4
security = HTTPBearer(auto_error=False)

SERVICE_LEVELS = {"basic", "standard", "express", "urgent"}
REPORT_TYPES = {"standard", "full"}

# Speed-to-service-level mapping
SPEED_TIER_MAP = {
    "7_days": "basic",
    "5_days": "standard",
    "3_days": "express",
    "2_days": "express",
    "1_day": "urgent",
    "24_hours": "urgent",
}
VALID_SPEEDS = set(SPEED_TIER_MAP.keys())
VALID_REPORT_TYPES_ARRAY = {"credit_report", "registration", "owners", "ubo", "legal", "analysis_financial"}

# Working days per country (weekend days)
# Most MENA: Friday-Saturday weekend
# UAE: Saturday-Sunday weekend
COUNTRY_WORKING_DAYS = {
    "egypt": {"fri", "sat"},
    "saudi arabia": {"fri", "sat"},
    "uae": {"sat", "sun"},
    "jordan": {"fri", "sat"},
    "qatar": {"fri", "sat"},
    "bahrain": {"fri", "sat"},
    "oman": {"fri", "sat"},
}

# Speed in working days
SPEED_DURATION_DAYS = {
    "7_days": 7,
    "5_days": 5,
    "3_days": 3,
    "2_days": 2,
    "1_day": 1,
    "24_hours": 0,  # Same day
}

def _calculate_due_date(speed: str, country: Optional[str] = None) -> str:
    """Calculate due date based on speed duration and country working days."""
    working_days = SPEED_DURATION_DAYS.get(speed, 5)
    weekend_days = COUNTRY_WORKING_DAYS.get(country.lower().strip() if country else "", {"fri", "sat"})

    now = datetime.now(timezone.utc)
    current = now
    days_added = 0

    while days_added < working_days:
        current += timedelta(days=1)
        # Skip weekends
        day_name = current.strftime("%a").lower()[:3]
        if day_name not in weekend_days:
            days_added += 1

    return current.isoformat()

PORTAL_UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads")) / "portal"
MAX_PORTAL_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
MAX_PORTAL_FILE_SIZE_BYTES = MAX_PORTAL_FILE_SIZE_MB * 1024 * 1024
MAX_PORTAL_FILES_PER_ORDER = int(os.getenv("MAX_PORTAL_FILES_PER_ORDER", "20"))
MAX_PORTAL_FILES_PER_COMPANY = int(os.getenv("MAX_PORTAL_FILES_PER_COMPANY", "5"))
ALLOWED_PORTAL_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".doc",
    ".png",
    ".jpg",
    ".jpeg",
    ".tiff",
    ".xlsx",
    ".xls",
    ".csv",
    ".txt",
}
FILE_TYPE_MAP = {
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
    service_level: Optional[Literal["basic", "standard", "express", "urgent"]] = None
    report_type: Optional[Literal["standard", "full"]] = None
    speed: Optional[str] = None
    report_types: Optional[List[str]] = None
    due_date: Optional[date] = None
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


def _quote(value: str, safe: str = "") -> str:
    return urllib.parse.quote(str(value), safe=safe)


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


async def _create_order_company(order_id: str, company: OrderCompanyRequest, index: int) -> Dict[str, Any]:
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
    result = await asyncio.to_thread(
        _supabase_request,
        "POST",
        "/order_companies",
        json_body=payload,
    )
    return _first_result(result) or {**payload, "id": None}


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


def _sanitize_portal_filename(filename: str) -> str:
    if not filename:
        return "unnamed_file"

    filename = Path(filename).name
    filename = re.sub(r"[^\w\-\.\s]", "_", filename)
    filename = filename.strip(". ")

    if not filename:
        return "unnamed_file"

    if len(filename) > 255:
        name, ext = Path(filename).stem, Path(filename).suffix
        filename = name[: 255 - len(ext)] + ext

    return filename


def _unique_portal_filename(directory: Path, filename: str) -> str:
    if not (directory / filename).exists():
        return filename

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    for _ in range(100):
        candidate = f"{stem}-{uuid.uuid4().hex[:8]}{suffix}"
        if not (directory / candidate).exists():
            return candidate

    return f"{stem}-{datetime.now(timezone.utc).timestamp()}{suffix}"


def _public_order_file(file: Dict[str, Any]) -> Dict[str, Any]:
    order_id = file.get("order_id")
    filename = file.get("filename")
    file_path = file.get("file_path", "")

    # Handle storage:// paths — generate a signed URL
    file_url = None
    if file_path and file_path.startswith("storage://"):
        # Extract bucket/path from storage://bucket/path
        storage_ref = file_path[len("storage://"):]
        parts = storage_ref.split("/", 1)
        if len(parts) == 2:
            bucket, path = parts
            signed = create_signed_url(bucket, path, expires_in=3600)
            if signed:
                file_url = signed
    elif order_id and filename:
        file_url = f"/uploads/portal/{_quote(order_id)}/{_quote(filename)}"

    return {
        "id": file.get("id"),
        "order_id": order_id,
        "order_company_id": file.get("order_company_id"),
        "filename": filename,
        "file_type": file.get("file_type"),
        "file_size": file.get("file_size", 0),
        "file_url": file_url,
        "created_at": file.get("created_at"),
    }


# Storage bucket for portal uploads
PORTAL_STORAGE_BUCKET = "portal-uploads"

# MIME type mapping
MIME_TYPE_MAP = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tiff": "image/tiff",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".csv": "text/csv",
    ".txt": "text/plain",
}


async def _save_portal_files(
    order_id: str,
    files: Optional[List[UploadFile]],
    file_company_indexes: Optional[List[int]],
    company_ids_by_index: Dict[int, str],
) -> List[Dict[str, Any]]:
    uploads = files or []
    if not uploads:
        return []

    if len(uploads) > MAX_PORTAL_FILES_PER_ORDER:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PORTAL_FILES_PER_ORDER} files per order allowed",
        )

    indexes = file_company_indexes or []
    if indexes and len(indexes) != len(uploads):
        raise HTTPException(status_code=400, detail="File company indexes do not match uploaded files")

    counts: Dict[int, int] = {}
    for index in indexes:
        if index < 0 or index >= len(company_ids_by_index):
            raise HTTPException(status_code=400, detail="Invalid file company index")
        counts[index] = counts.get(index, 0) + 1
        if counts[index] > MAX_PORTAL_FILES_PER_COMPANY:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {MAX_PORTAL_FILES_PER_COMPANY} files per company allowed",
            )

    # Ensure the storage bucket exists
    ensure_storage_bucket(PORTAL_STORAGE_BUCKET)

    saved_rows: List[Dict[str, Any]] = []
    for index, upload in enumerate(uploads):
        original_name = upload.filename or "unnamed_file"
        ext = Path(original_name).suffix.lower()
        if ext not in ALLOWED_PORTAL_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(ALLOWED_PORTAL_EXTENSIONS))}",
            )

        content = await upload.read()
        if len(content) > MAX_PORTAL_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File '{original_name}' exceeds maximum size of {MAX_PORTAL_FILE_SIZE_MB}MB",
            )

        safe_name = _sanitize_portal_filename(original_name)
        # Use unique name if needed (append short uuid for uniqueness)
        storage_path = f"{order_id}/{safe_name}"
        content_type = MIME_TYPE_MAP.get(ext, "application/octet-stream")

        # Upload to Supabase Storage
        uploaded = await asyncio.to_thread(
            upload_to_storage,
            PORTAL_STORAGE_BUCKET,
            storage_path,
            content,
            content_type,
        )
        if not uploaded:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload file '{original_name}' to storage",
            )

        # Store the storage path in the database (not local disk path)
        row = create_order_file(
            {
                "order_id": order_id,
                "order_company_id": company_ids_by_index.get(indexes[index]) if indexes else None,
                "filename": safe_name,
                "file_path": f"storage://{PORTAL_STORAGE_BUCKET}/{storage_path}",
                "file_type": FILE_TYPE_MAP.get(ext, "unknown"),
                "file_size": len(content),
                "processed": False,
            }
        )
        saved_rows.append(row)

    return saved_rows


async def _submit_order_payload(
    body: SubmitOrderRequest,
    portal_client: Dict[str, str],
    files: Optional[List[UploadFile]] = None,
    file_company_indexes: Optional[List[int]] = None,
) -> Dict[str, Any]:
    if not body.companies:
        raise HTTPException(status_code=400, detail="At least one company is required")

    # Support both old and new field names for backward compatibility
    if body.speed:
        if body.speed not in VALID_SPEEDS:
            raise HTTPException(status_code=400, detail=f"Invalid speed. Valid: {', '.join(sorted(VALID_SPEEDS))}")
        resolved_service_level = SPEED_TIER_MAP[body.speed]
    elif body.service_level:
        if body.service_level not in SERVICE_LEVELS:
            raise HTTPException(status_code=400, detail="Invalid service_level")
        resolved_service_level = body.service_level
    else:
        resolved_service_level = "standard"

    if body.report_types:
        for rt in body.report_types:
            if rt not in VALID_REPORT_TYPES_ARRAY:
                raise HTTPException(status_code=400, detail=f"Invalid report_type: {rt}")
        resolved_report_types = body.report_types
    elif body.report_type:
        resolved_report_types = [body.report_type]
    else:
        resolved_report_types = ["credit_report"]

    # Auto-calculate due date from speed + country
    first_country = body.companies[0].country if body.companies else None
    resolved_speed = body.speed or "5_days"
    if body.due_date:
        due_date_str = f"{body.due_date.isoformat()}T00:00:00Z"
    else:
        due_date_str = _calculate_due_date(resolved_speed, first_country)

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
        "service_level": resolved_service_level,
        "speed": resolved_speed,
        "due_date": due_date_str,
        "report_type": ",".join(resolved_report_types),
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

    company_ids_by_index: Dict[int, str] = {}
    try:
        for index, company in enumerate(body.companies):
            created_company = await _create_order_company(order["id"], company, index)
            if created_company and created_company.get("id"):
                company_ids_by_index[index] = created_company["id"]

        uploaded_files = await _save_portal_files(
            order["id"],
            files,
            file_company_indexes,
            company_ids_by_index,
        )
        await _increment_session_used_count(portal_client["session_id"])
    except Exception:
        raise

    return {
        "order_id": order.get("id"),
        "order_number": order.get("order_number", order_number),
        "company_count": len(body.companies),
        "due_date": due_date_str,
        "files": [_public_order_file(file) for file in uploaded_files],
        "message": "Order submitted successfully",
    }


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
    return await _submit_order_payload(body, portal_client)


@router.post("/submit-order-with-files")
async def submit_order_with_files(
    portal_client: Dict[str, str] = Depends(get_portal_current_client),
    order_data: str = Form(...),
    files: Optional[List[UploadFile]] = File(default=None),
    file_company_indexes: Optional[List[int]] = File(default=None),
):
    try:
        payload = json.loads(order_data)
        body = SubmitOrderRequest(**payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid order payload: {exc}") from exc

    return await _submit_order_payload(body, portal_client, files, file_company_indexes)


@router.get("/order-status/{order_number}")
async def get_order_status(
    order_number: str = PathParam(..., description="Order number"),
    portal_client: Dict[str, str] = Depends(get_portal_current_client),
):
    order = await _get_order_by_number_for_client(order_number, portal_client["client_id"])
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    companies = await _get_order_companies(order["id"])
    files = await asyncio.to_thread(get_order_files, order["id"])
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
        "files": [_public_order_file(file) for file in files],
    }
