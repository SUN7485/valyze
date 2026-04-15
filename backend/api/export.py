"""
Export API - Multi-format export endpoints.
Supports: JSON, XML, Excel (XLSX), CSV, Word (DOCX)
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database.crud import get_report
from database.db import get_db
from services import export_service

router = APIRouter(prefix="/api/export", tags=["export"])

OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)


def _get_company_name_from_report(report) -> str:
    """Extract company name from report."""
    fields = report.fields if hasattr(report, "fields") else report.get("fields", {})

    if hasattr(fields, "get"):
        company_name = fields.get("company_name")
        if company_name and hasattr(company_name, "value"):
            return str(company_name.value) or "Report"
        if isinstance(company_name, dict):
            return str(company_name.get("value", "")) or "Report"

    return "Report"


async def _get_report_or_404(report_id: str, db: AsyncSession):
    """Get report or raise 404."""
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(404, f"Report {report_id} not found")
    return report


# ---------------------------------------------------------------------------
# Export Endpoints
# ---------------------------------------------------------------------------


@router.post("/json/{report_id}")
async def export_report_json(report_id: str, db: AsyncSession = Depends(get_db)):
    """Export report as JSON."""
    report = await _get_report_or_404(report_id, db)

    report_dict = report.model_dump() if hasattr(report, "model_dump") else dict(report)
    result = export_service.export_json(report_dict, report_id)

    if not result["success"]:
        raise HTTPException(500, f"JSON export failed: {result.get('error')}")

    return {
        "success": True,
        "report_id": report_id,
        "format": "json",
        "file_size_kb": result.get("file_size_kb", 0),
        "download_url": f"/api/export/download/{report_id}/json",
    }


@router.post("/xml/{report_id}")
async def export_report_xml(report_id: str, db: AsyncSession = Depends(get_db)):
    """Export report as XML."""
    report = await _get_report_or_404(report_id, db)

    report_dict = report.model_dump() if hasattr(report, "model_dump") else dict(report)
    result = export_service.export_xml(report_dict, report_id)

    if not result["success"]:
        raise HTTPException(500, f"XML export failed: {result.get('error')}")

    return {
        "success": True,
        "report_id": report_id,
        "format": "xml",
        "file_size_kb": result.get("file_size_kb", 0),
        "download_url": f"/api/export/download/{report_id}/xml",
    }


@router.post("/excel/{report_id}")
async def export_report_excel(report_id: str, db: AsyncSession = Depends(get_db)):
    """Export report as Excel."""
    report = await _get_report_or_404(report_id, db)

    report_dict = report.model_dump() if hasattr(report, "model_dump") else dict(report)
    result = export_service.export_excel(report_dict, report_id)

    if not result["success"]:
        raise HTTPException(500, f"Excel export failed: {result.get('error')}")

    return {
        "success": True,
        "report_id": report_id,
        "format": "xlsx",
        "file_size_kb": result.get("file_size_kb", 0),
        "download_url": f"/api/export/download/{report_id}/xlsx",
    }


@router.post("/csv/{report_id}")
async def export_report_csv(report_id: str, db: AsyncSession = Depends(get_db)):
    """Export report as CSV."""
    report = await _get_report_or_404(report_id, db)

    report_dict = report.model_dump() if hasattr(report, "model_dump") else dict(report)
    result = export_service.export_csv(report_dict, report_id)

    if not result["success"]:
        raise HTTPException(500, f"CSV export failed: {result.get('error')}")

    return {
        "success": True,
        "report_id": report_id,
        "format": "csv",
        "file_size_kb": result.get("file_size_kb", 0),
        "download_url": f"/api/export/download/{report_id}/csv",
    }


@router.post("/word/{report_id}")
async def export_report_word(report_id: str, db: AsyncSession = Depends(get_db)):
    """Export report as Word."""
    report = await _get_report_or_404(report_id, db)

    report_dict = report.model_dump() if hasattr(report, "model_dump") else dict(report)
    result = export_service.export_word(report_dict, report_id)

    if not result["success"]:
        raise HTTPException(500, f"Word export failed: {result.get('error')}")

    return {
        "success": True,
        "report_id": report_id,
        "format": "docx",
        "file_size_kb": result.get("file_size_kb", 0),
        "download_url": f"/api/export/download/{report_id}/docx",
    }


# ---------------------------------------------------------------------------
# Download Endpoints
# ---------------------------------------------------------------------------


@router.get("/download/{report_id}/{format}")
async def download_export(
    report_id: str, format: str, db: AsyncSession = Depends(get_db)
):
    """Download exported file."""
    await _get_report_or_404(report_id, db)

    format_map = {
        "json": "json",
        "xml": "xml",
        "xlsx": "xlsx",
        "csv": "csv",
        "docx": "docx",
    }

    ext = format_map.get(format, format)
    if ext not in ["json", "xml", "xlsx", "csv", "docx"]:
        raise HTTPException(400, f"Unsupported format: {format}")

    # Get company name for filename
    report = await get_report(db, report_id)
    company_name = _get_company_name_from_report(report)
    safe_name = company_name.replace(" ", "_")[:30]
    filename = f"CreditReport_{safe_name}.{ext}"

    file_path = OUTPUT_DIR / f"{report_id}.{ext}"

    if not file_path.exists():
        raise HTTPException(404, f"File not found. Export {format} first.")

    media_types = {
        "json": "application/json",
        "xml": "application/xml",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }

    return FileResponse(
        path=str(file_path),
        media_type=media_types.get(ext, "application/octet-stream"),
        filename=filename,
    )


@router.get("/status/{report_id}")
async def export_status(report_id: str, db: AsyncSession = Depends(get_db)):
    """Check export file status."""
    await _get_report_or_404(report_id, db)

    files = export_service.check_export_files(report_id)

    return {
        "report_id": report_id,
        "files": files,
    }
