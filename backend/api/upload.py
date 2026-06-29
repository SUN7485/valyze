"""
Upload API routes forValyze Credit report.

Handles report creation, file upload, status checks, and file deletion.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel


from database.crud import (
    add_uploaded_file,
    create_report,
    delete_uploaded_file,
    get_report,
    get_uploaded_files,
    update_report_field,
    update_report_status,
)
from services.supabase_client import get_report_by_cr_number

load_dotenv()

router = APIRouter(prefix="/api/upload", tags=["upload"])


# ---------------------------------------------------------------------------
# Security utilities
# ---------------------------------------------------------------------------


def _sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename to prevent path traversal attacks.

    Removes path components, replaces unsafe characters, and ensures
    the filename is safe to use for file storage.
    """
    if not filename:
        return "unnamed_file"

    # Remove path components (anything before last / or \
    filename = Path(filename).name

    # Replace unsafe characters
    filename = re.sub(r"[^\w\-\.\s]", "_", filename)

    # Remove leading/trailing dots and spaces
    filename = filename.strip(". ")

    # Ensure we have a valid filename
    if not filename:
        return "unnamed_file"

    # Limit length
    if len(filename) > 255:
        name, ext = Path(filename).stem, Path(filename).suffix
        filename = name[: 255 - len(ext)] + ext

    return filename


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".png", ".jpg", ".jpeg", ".tiff"}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class StartUploadRequest(BaseModel):
    client_name: Optional[str] = None
    client_reference: Optional[str] = None
    analyst_name: Optional[str] = None
    analyst_id: Optional[str] = None
    order_comment: Optional[str] = None
    company_name_hint: Optional[str] = None


class StartUploadResponse(BaseModel):
    report_id: str
    status: str


class FileListResponse(BaseModel):
    files_received: int
    file_list: List[dict]


class UploadStatusResponse(BaseModel):
    report_id: str
    status: str
    files: List[dict]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/start", response_model=StartUploadResponse)
async def start_upload(body: StartUploadRequest):
    """Create a new report and return its ID."""
    print("[UPLOAD] start_upload called")
    report_id = str(uuid.uuid4())
    print(f"[UPLOAD] Creating report: {report_id}")
    try:
        report = await create_report(None, report_id)
        print(f"[UPLOAD] Report created: {report_id}")
    except Exception as e:
        print(f"[UPLOAD] Error creating report: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create report: {e}")

    now = datetime.now(timezone.utc)
    await update_report_field(None, report_id, "report_id", report_id, "high", "system")
    await update_report_field(
        None, report_id, "report_date", now.strftime("%Y-%m-%d"), "high", "system"
    )
    await update_report_field(
        None, report_id, "current_year", str(now.year), "high", "system"
    )

    if body.client_name:
        await update_report_field(
            None, report_id, "client_name", body.client_name, "high", "user"
        )
    if body.client_reference:
        await update_report_field(
            None, report_id, "client_reference", body.client_reference, "high", "user"
        )
    if body.analyst_name:
        await update_report_field(
            None, report_id, "analyst_name", body.analyst_name, "high", "user"
        )
    if body.analyst_id:
        await update_report_field(
            None, report_id, "analyst_id", body.analyst_id, "high", "user"
        )
    if body.order_comment:
        await update_report_field(
            None, report_id, "order_comment", body.order_comment, "high", "user"
        )
    if body.company_name_hint:
        await update_report_field(
            None, report_id, "company_name", body.company_name_hint, "medium", "user"
        )

    await update_report_status(None, report_id, "uploading")
    return StartUploadResponse(report_id=report_id, status="uploading")


@router.post("/files/{report_id}", response_model=FileListResponse)
async def upload_files(
    report_id: str,
    files: List[UploadFile] = File(...),
):
    """Upload one or more files for a report."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    report_dir = UPLOAD_DIR / report_id
    report_dir.mkdir(parents=True, exist_ok=True)

    file_list: List[dict] = []

    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        content = f.file.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' exceeds maximum size of {MAX_FILE_SIZE_MB}MB",
            )

        safe_name = _sanitize_filename(f.filename or f"file{ext}")
        file_path = report_dir / safe_name
        file_path.write_bytes(content)

        file_type_map = {
            ".pdf": "pdf",
            ".docx": "word",
            ".doc": "word",
            ".png": "image",
            ".jpg": "image",
            ".jpeg": "image",
            ".tiff": "image",
        }
        file_type = file_type_map.get(ext, "unknown")

        await add_uploaded_file(
            None,
            report_id=report_id,
            filename=safe_name,
            file_path=str(file_path),
            file_type=file_type,
            file_size=len(content),
        )

        file_list.append(
            {
                "filename": safe_name,
                "file_type": file_type,
                "file_size": len(content),
            }
        )

    return FileListResponse(files_received=len(file_list), file_list=file_list)


@router.get("/status/{report_id}", response_model=UploadStatusResponse)
async def upload_status(report_id: str):
    """Return the current report status and uploaded file list."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    file_rows = await get_uploaded_files(None, report_id)
    files = [
        {
            "filename": fr.get("filename"),
            "file_type": fr.get("file_type"),
            "file_size": fr.get("file_size"),
            "processed": fr.get("processed"),
        }
        for fr in file_rows
    ]

    return UploadStatusResponse(
        report_id=report_id,
        status=report.status,
        files=files,
    )


@router.delete("/file/{report_id}/{filename}")
async def remove_file(
    report_id: str,
    filename: str,
):
    """Remove a specific uploaded file from disk and database."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    file_rows = await get_uploaded_files(None, report_id)
    valid_names = {fr.get("filename") for fr in file_rows}

    sanitized_filename = _sanitize_filename(filename)
    if sanitized_filename not in valid_names:
        raise HTTPException(status_code=404, detail="File not found for this report")

    file_path = UPLOAD_DIR / report_id / sanitized_filename
    if file_path.exists():
        file_path.unlink()

    deleted = await delete_uploaded_file(None, report_id, sanitized_filename)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete file record")

    return {"success": True, "message": f"File '{sanitized_filename}' deleted"}


# ---------------------------------------------------------------------------
# Duplicate Detection
# ---------------------------------------------------------------------------

@router.post("/check-duplicate")
async def check_duplicate(body: dict):
    """
    Check if a report already exists for the given CR number or company name.
    Used to prevent duplicate company reports.
    """
    cr_number = body.get("cr_number")
    company_name = body.get("company_name")
    if not cr_number and not company_name:
        raise HTTPException(status_code=400, detail="cr_number or company_name required")

    # Primary check: exact CR number (unique business key)
    if cr_number:
        existing = get_report_by_cr_number(str(cr_number))
        if existing:
            return {
                "duplicate": True,
                "existing_report": {
                    "id": existing.get("id"),
                    "company_name": existing.get("company_name"),
                    "cr_number": existing.get("cr_number"),
                    "status": existing.get("status"),
                },
            }

    # Optional: company name fuzzy match (not implemented for now)
    return {"duplicate": False}


# ---------------------------------------------------------------------------
# Portal File Access
# ---------------------------------------------------------------------------


@router.get("/portal-files/{report_id}")
async def get_portal_files(report_id: str):
    """Return uploaded files for a report with download paths."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    file_rows = await get_uploaded_files(None, report_id)
    files = [
        {
            "filename": fr.get("filename"),
            "file_type": fr.get("file_type"),
            "file_size": fr.get("file_size"),
            "download_path": f"/api/upload/download/{report_id}/{fr.get('filename')}",
        }
        for fr in file_rows
        if fr.get("filename")
    ]
    return {"report_id": report_id, "files": files}


@router.get("/download/{report_id}/{filename}")
async def download_file(report_id: str, filename: str):
    """Download a file uploaded for a report (local disk or Supabase Storage)."""
    import mimetypes
    from fastapi.responses import Response as FastAPIResponse

    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    file_rows = await get_uploaded_files(None, report_id)
    safe_name = _sanitize_filename(filename)
    fr = next((r for r in file_rows if r.get("filename") == safe_name), None)
    if not fr:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = fr.get("file_path", "")

    if file_path.startswith("storage://"):
        storage_ref = file_path[len("storage://"):]
        parts = storage_ref.split("/", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=500, detail="Invalid storage path")
        bucket, path = parts
        from services.supabase_client import download_from_storage
        content = download_from_storage(bucket, path)
        if not content:
            raise HTTPException(status_code=404, detail="File not found in storage")
        mime = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
        return FastAPIResponse(
            content=content,
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
        )

    local = Path(file_path) if file_path else UPLOAD_DIR / report_id / safe_name
    if not local.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    from fastapi.responses import FileResponse
    return FileResponse(str(local), filename=safe_name)
