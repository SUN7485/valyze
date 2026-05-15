"""
Export API - Multi-format export endpoints.
Supports: JSON, XML, Excel (XLSX), CSV, Word (DOCX)
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse


from services import export_service
from database.crud import get_report

from services.auth import get_current_user

router = APIRouter(prefix="/api/export", tags=["export"], dependencies=[Depends(get_current_user)])

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


async def _get_report_or_404(report_id: str):
    """Get report or raise 404."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(404, f"Report {report_id} not found")
    return report


# ---------------------------------------------------------------------------
# Export Endpoints
# ---------------------------------------------------------------------------


@router.post("/json/{report_id}")
async def export_report_json(report_id: str):
    """Export report as JSON."""
    report = await _get_report_or_404(report_id)
    result = export_service.export_json(report.model_dump(), report_id)
    if not result.get("success"):
        raise HTTPException(500, f"JSON export failed: {result.get('error', 'Unknown error')}")
    result["download_url"] = f"/api/export/download/{report_id}/json"
    return result


@router.post("/xml/{report_id}")
async def export_report_xml(report_id: str):
    """Export report as XML."""
    report = await _get_report_or_404(report_id)
    result = export_service.export_xml(report.model_dump(), report_id)
    if not result.get("success"):
        raise HTTPException(500, f"XML export failed: {result.get('error', 'Unknown error')}")
    result["download_url"] = f"/api/export/download/{report_id}/xml"
    return result


@router.post("/excel/{report_id}")
async def export_report_excel(report_id: str):
    """Export report as Excel."""
    report = await _get_report_or_404(report_id)
    result = export_service.export_excel(report.model_dump(), report_id)
    if not result.get("success"):
        raise HTTPException(500, f"Excel export failed: {result.get('error', 'Unknown error')}")
    result["download_url"] = f"/api/export/download/{report_id}/excel"
    # Rename file_path to filepath for frontend compatibility (optional)
    result["filepath"] = result.pop("file_path")
    return result


@router.post("/csv/{report_id}")
async def export_report_csv(report_id: str):
    """Export report as CSV."""
    report = await _get_report_or_404(report_id)
    result = export_service.export_csv(report.model_dump(), report_id)
    if not result.get("success"):
        raise HTTPException(500, f"CSV export failed: {result.get('error', 'Unknown error')}")
    result["download_url"] = f"/api/export/download/{report_id}/csv"
    result["filepath"] = result.pop("file_path")
    return result


@router.post("/word/{report_id}")
async def export_report_word(report_id: str):
    """Export report as Word."""
    report = await _get_report_or_404(report_id)
    result = export_service.export_word(report.model_dump(), report_id)
    if not result.get("success"):
        raise HTTPException(500, f"Word export failed: {result.get('error', 'Unknown error')}")
    result["download_url"] = f"/api/export/download/{report_id}/word"
    result["filepath"] = result.pop("file_path")
    return result


@router.get("/download/{report_id}/{format}")
async def download_export(report_id: str, format: str):
    """Download generated export file."""
    filename = f"{report_id}.{format}"
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(404, "Export file not found")
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream",
    )


@router.get("/status/{report_id}")
async def export_status(report_id: str):
    """Check export generation status."""
    # Check if any export files exist
    formats = ["json", "xml", "xlsx", "csv", "docx"]
    available = []
    for fmt in formats:
        if (OUTPUT_DIR / f"{report_id}.{fmt}").exists():
            available.append(fmt)
    return {
        "report_id": report_id,
        "export_formats": available,
        "total": len(available),
    }


# ---------------------------------------------------------------------------
# Backup Endpoints (Phase 6)
# ---------------------------------------------------------------------------


@router.get("/backup/all")
async def export_all_reports_backup():
    """Export all reports as a single JSON backup file."""
    from database.crud import get_all_reports

    reports = await get_all_reports(None)
    if not reports:
        return {"message": "No reports to backup", "count": 0}

    backup_data = {
        "version": "1.0.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "total_reports": len(reports),
        "reports": [r.model_dump() if hasattr(r, "model_dump") else r for r in reports],
    }

    return backup_data


@router.get("/backup/download/all")
async def download_all_reports_backup():
    """Download all reports as a downloadable JSON backup file."""
    from database.crud import get_all_reports

    reports = await get_all_reports(None)
    if not reports:
        raise HTTPException(404, "No reports to backup")

    backup_data = {
        "version": "1.0.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "total_reports": len(reports),
        "reports": [r.model_dump() if hasattr(r, "model_dump") else r for r in reports],
    }

    import json

    filename = (
        f"valyze_backup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    )
    file_path = OUTPUT_DIR / filename
    file_path.write_text(json.dumps(backup_data, indent=2, default=str))

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/json",
    )
