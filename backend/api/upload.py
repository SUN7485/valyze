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
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database.crud import (
    add_uploaded_file,
    create_report,
    delete_uploaded_file,
    get_report,
    get_uploaded_files,
    update_report_field,
    update_report_status,
)
from database.db import get_db

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
    filename = re.sub(r'[^\w\-\.\s]', '_', filename)
    
    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')
    
    # Ensure we have a valid filename
    if not filename:
        return "unnamed_file"
    
    # Limit length
    if len(filename) > 255:
        name, ext = Path(filename).stem, Path(filename).suffix
        filename = name[:255 - len(ext)] + ext
    
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
async def start_upload(body: StartUploadRequest, db: AsyncSession = Depends(get_db)):
    """Create a new report and return its ID."""
    report_id = str(uuid.uuid4())

    try:
        report = await create_report(db, report_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create report: {e}")

    # Set system fields
    now = datetime.now(timezone.utc)
    await update_report_field(db, report_id, "report_id", report_id, "high", "system")
    await update_report_field(db, report_id, "report_date", now.strftime("%Y-%m-%d"), "high", "system")
    await update_report_field(db, report_id, "current_year", str(now.year), "high", "system")

    # Set user fields
    if body.client_name:
        await update_report_field(db, report_id, "client_name", body.client_name, "high", "user")
    if body.client_reference:
        await update_report_field(db, report_id, "client_reference", body.client_reference, "high", "user")
    if body.analyst_name:
        await update_report_field(db, report_id, "analyst_name", body.analyst_name, "high", "user")
    if body.analyst_id:
        await update_report_field(db, report_id, "analyst_id", body.analyst_id, "high", "user")
    if body.order_comment:
        await update_report_field(db, report_id, "order_comment", body.order_comment, "high", "user")
    if body.company_name_hint:
        await update_report_field(db, report_id, "company_name", body.company_name_hint, "medium", "user")

    await update_report_status(db, report_id, "uploading")

    return StartUploadResponse(report_id=report_id, status="uploading")


@router.post("/files/{report_id}", response_model=FileListResponse)
async def upload_files(
    report_id: str,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload one or more files for a report."""
    # Verify report exists
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    report_dir = UPLOAD_DIR / report_id
    report_dir.mkdir(parents=True, exist_ok=True)

    file_list: List[dict] = []

    for f in files:
        # Validate extension
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        # Read content and validate size
        content = await f.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' exceeds maximum size of {MAX_FILE_SIZE_MB}MB",
            )

        # Sanitize filename to prevent path traversal
        safe_name = _sanitize_filename(f.filename or f"file{ext}")
        file_path = report_dir / safe_name
        file_path.write_bytes(content)

        # Map extension to type
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

        # Record in database
        await add_uploaded_file(
            db,
            report_id=report_id,
            filename=safe_name,
            file_path=str(file_path),
            file_type=file_type,
            file_size=len(content),
        )

        file_list.append({
            "filename": safe_name,
            "file_type": file_type,
            "file_size": len(content),
        })

    return FileListResponse(files_received=len(file_list), file_list=file_list)


@router.get("/status/{report_id}", response_model=UploadStatusResponse)
async def upload_status(report_id: str, db: AsyncSession = Depends(get_db)):
    """Return the current report status and uploaded file list."""
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    file_rows = await get_uploaded_files(db, report_id)
    files = [
        {
            "filename": fr.filename,
            "file_type": fr.file_type,
            "file_size": fr.file_size,
            "processed": fr.processed,
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
    db: AsyncSession = Depends(get_db),
):
    """Remove a specific uploaded file from disk and database."""
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    # Validate filename against database records to prevent path traversal
    file_rows = await get_uploaded_files(db, report_id)
    valid_names = {fr.filename for fr in file_rows}
    
    # Also sanitize the input filename
    sanitized_filename = _sanitize_filename(filename)
    
    if sanitized_filename not in valid_names:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Delete from disk using validated filename
    file_path = UPLOAD_DIR / report_id / sanitized_filename
    if file_path.exists():
        file_path.unlink()

    # Delete from database
    deleted = await delete_uploaded_file(db, report_id, sanitized_filename)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found in database")

    return {"message": f"File '{sanitized_filename}' deleted", "report_id": report_id}
