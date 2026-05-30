"""
Export API - Multi-format export endpoints.
Supports: JSON, XML, Excel (XLSX), CSV, Word (DOCX)
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import json as json_mod

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from services import export_service
from database.crud import get_report

router = APIRouter(prefix="/api/export", tags=["export"])

# Safe directory init for Vercel serverless (read-only filesystem)
OUTPUT_DIR = Path("/tmp/outputs")
try:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass  # Vercel serverless - will create on first request


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
    """Export report as JSON file download."""
    report = await _get_report_or_404(report_id)
    content = json_mod.dumps(report.model_dump(), indent=2, default=str)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.json"'},
    )


@router.post("/xml/{report_id}")
async def export_report_xml(report_id: str):
    """Export report as XML file download."""
    report = await _get_report_or_404(report_id)
    xml_content = await export_service.generate_xml(report)
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.xml"'},
    )


@router.post("/excel/{report_id}")
async def export_report_excel(report_id: str):
    """Export report as Excel file download."""
    report = await _get_report_or_404(report_id)
    filepath = await export_service.generate_excel(report, OUTPUT_DIR)
    return FileResponse(
        path=str(filepath),
        filename=f"{_get_company_name_from_report(report)}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/csv/{report_id}")
async def export_report_csv(report_id: str):
    """Export report as CSV file download."""
    report = await _get_report_or_404(report_id)
    filepath = await export_service.generate_csv(report, OUTPUT_DIR)
    return FileResponse(
        path=str(filepath),
        filename=f"{_get_company_name_from_report(report)}.csv",
        media_type="text/csv",
    )


@router.post("/word/{report_id}")
async def export_report_word(report_id: str):
    """Export report as Word file download."""
    report = await _get_report_or_404(report_id)
    filepath = await export_service.generate_word(report, OUTPUT_DIR)
    return FileResponse(
        path=str(filepath),
        filename=f"{_get_company_name_from_report(report)}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


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
# Backup Endpoints
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