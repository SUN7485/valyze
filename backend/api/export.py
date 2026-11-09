"""
Export API - Multi-format export endpoints.
All generation is done inline to avoid import failures in Vercel serverless.
"""

from __future__ import annotations

import csv
import io
import json as json_mod
import base64
import re
from datetime import datetime, timezone
from xml.etree.ElementTree import Element, SubElement, tostring

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from api._http import content_disposition
from api.auth import get_current_user, get_current_user_flexible, require_admin
from database.crud import get_report
from database.exceptions import InvalidReportDataError
from services.report_queries import is_valid_report_id

router = APIRouter(prefix="/api/export", tags=["export"])


def _get_fields(report) -> dict:
    """Extract fields dict from report (handles both model and dict)."""
    fields = report.fields if hasattr(report, "fields") else report.get("fields", {})
    if hasattr(fields, "items"):
        return fields
    return {}


def _fv(fields: dict, key: str, default="") -> str:
    """Get a field value as string."""
    f = fields.get(key)
    if f is None:
        return default
    if hasattr(f, "value"):
        v = f.value
    elif isinstance(f, dict):
        v = f.get("value")
    else:
        v = f
    if v is None:
        return default
    return str(v)


def _safe(val) -> str:
    if val is None:
        return ""
    return str(val)


async def _get_report_or_404(report_id: str):
    if not is_valid_report_id(report_id):
        raise HTTPException(400, "Invalid report_id format")
    try:
        report = await get_report(None, report_id, strict=True)
    except InvalidReportDataError:
        raise HTTPException(422, "Report data is empty or invalid")
    if report is None:
        raise HTTPException(404, f"Report {report_id} not found")
    return report


_XML_NAME_BAD = re.compile(r"[^A-Za-z0-9_.-]")
# Characters XML 1.0 cannot carry at all (C0 controls other than tab/CR/LF).
_XML_TEXT_BAD = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]")


def _xml_tag(key: str) -> str:
    """A valid XML element name for a field key ("1st_year" -> "_1st_year",
    "net margin" -> "net_margin"); names may not start with a digit, '-', '.'
    or the reserved "xml" prefix."""
    tag = _XML_NAME_BAD.sub("_", str(key)) or "_"
    if not (tag[0].isalpha() or tag[0] == "_") or tag.lower().startswith("xml"):
        tag = "_" + tag
    return tag


def _xml_text(value: str) -> str:
    return _XML_TEXT_BAD.sub("", value)


def _company_name(report) -> str:
    fields = _get_fields(report)
    name = _fv(fields, "company_name") or _fv(fields, "legal_name") or "Report"
    return name


# ---------------------------------------------------------------------------
# Export Endpoints — all return content directly
# ---------------------------------------------------------------------------


@router.post("/json/{report_id}")
async def export_report_json(report_id: str, user: dict = Depends(get_current_user)):
    """Export report as JSON file download."""
    report = await _get_report_or_404(report_id)
    data = report.model_dump() if hasattr(report, "model_dump") else report
    content = json_mod.dumps(data, indent=2, default=str, ensure_ascii=False)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": content_disposition(f"{report_id}.json")},
    )


@router.post("/xml/{report_id}")
async def export_report_xml(report_id: str, user: dict = Depends(get_current_user)):
    """Export report as XML file download."""
    report = await _get_report_or_404(report_id)
    fields = _get_fields(report)

    root = Element("CreditReport")
    for key in sorted(fields.keys()):
        val = _fv(fields, key)
        if val:
            SubElement(root, _xml_tag(key)).text = _xml_text(val)

    xml_bytes = tostring(root, encoding="unicode", method="xml")
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_bytes

    return Response(
        content=xml_str,
        media_type="application/xml",
        headers={"Content-Disposition": content_disposition(f"{report_id}.xml")},
    )


@router.post("/csv/{report_id}")
async def export_report_csv(report_id: str, user: dict = Depends(get_current_user)):
    """Export report as CSV file download."""
    report = await _get_report_or_404(report_id)
    fields = _get_fields(report)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Field", "Value"])
    for key in sorted(fields.keys()):
        writer.writerow([key, _fv(fields, key)])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": content_disposition(f"{_company_name(report)}.csv")},
    )


@router.post("/excel/{report_id}")
async def export_report_excel(report_id: str, user: dict = Depends(get_current_user)):
    """Export report as Excel — returns base64-encoded XLSX."""
    report = await _get_report_or_404(report_id)
    fields = _get_fields(report)

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill

        wb = Workbook()
        ws = wb.active
        ws.title = "Credit Report"

        # Header style
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")

        ws.cell(row=1, column=1, value="Field").font = header_font
        ws.cell(row=1, column=1).fill = header_fill
        ws.cell(row=1, column=2, value="Value").font = header_font
        ws.cell(row=1, column=2).fill = header_fill

        for i, key in enumerate(sorted(fields.keys()), start=2):
            ws.cell(row=i, column=1, value=key)
            ws.cell(row=i, column=2, value=_fv(fields, key))

        ws.column_dimensions["A"].width = 35
        ws.column_dimensions["B"].width = 60

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode()

        return {"success": True, "base64": b64, "filename": f"{_company_name(report)}.xlsx"}
    except ImportError:
        raise HTTPException(500, "Excel export requires openpyxl — not installed")
    except Exception as e:
        print(f"[EXPORT] Excel export failed: {e}")
        raise HTTPException(500, "Excel export failed")


@router.post("/word/{report_id}")
async def export_report_word(report_id: str, user: dict = Depends(get_current_user)):
    """Export report as Word — returns base64-encoded DOCX."""
    report = await _get_report_or_404(report_id)
    fields = _get_fields(report)

    try:
        from docx import Document
        from docx.shared import Inches, Pt
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        doc = Document()
        doc.add_heading(_company_name(report), level=0)
        doc.add_heading("Credit Report", level=1)

        table = doc.add_table(rows=1, cols=2)
        table.style = "Table Grid"
        hdr = table.rows[0].cells
        hdr[0].text = "Field"
        hdr[1].text = "Value"

        for key in sorted(fields.keys()):
            row = table.add_row().cells
            row[0].text = key
            row[1].text = _fv(fields, key)

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode()

        return {"success": True, "base64": b64, "filename": f"{_company_name(report)}.docx"}
    except ImportError:
        raise HTTPException(500, "Word export requires python-docx — not installed")
    except Exception as e:
        print(f"[EXPORT] Word export failed: {e}")
        raise HTTPException(500, "Word export failed")


@router.get("/status/{report_id}")
async def export_status(report_id: str):
    """Check export generation status."""
    if not is_valid_report_id(report_id):
        raise HTTPException(400, "Invalid report_id format")
    return {
        "report_id": report_id,
        "engine": "inline",
        "message": "Exports are generated on-demand",
    }


# ---------------------------------------------------------------------------
# Backup Endpoints
# ---------------------------------------------------------------------------


@router.get("/backup/all")
async def export_all_reports_backup(user: dict = Depends(get_current_user_flexible)):
    """Export all reports as JSON. Admin-only — this dumps the whole database."""
    require_admin(user)
    from database.crud import get_all_reports
    reports = await get_all_reports(None)
    if not reports:
        return {"message": "No reports to backup", "count": 0}
    return {
        "version": "1.0.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "total_reports": len(reports),
        "reports": [r.model_dump() if hasattr(r, "model_dump") else r for r in reports],
    }


@router.get("/backup/download/all")
async def download_all_reports_backup(user: dict = Depends(get_current_user_flexible)):
    """Download all reports as a JSON backup. Admin-only — dumps the whole database."""
    require_admin(user)
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
    content = json_mod.dumps(backup_data, indent=2, default=str)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": content_disposition("valyze_backup.json")},
    )