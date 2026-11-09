from __future__ import annotations

"""
PDF API — Returns HTML for client-side PDF generation.
The frontend uses html2pdf.js to convert HTML to PDF in the browser.
No Gotenberg, no Playwright, no Docker needed.
"""

import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from database.crud import get_report
from database.exceptions import InvalidReportDataError
from pdf_generator import PDFGenerator
from services.report_queries import get_report_fields, is_valid_report_id

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


# -----------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------


async def _load(report_id: str):
    if not is_valid_report_id(report_id):
        raise HTTPException(400, "Invalid report_id format")
    try:
        report = await get_report(None, report_id, strict=True)
    except InvalidReportDataError:
        raise HTTPException(422, "Report data is empty or invalid")
    if report is None:
        raise HTTPException(404, "Report not found")
    return report


def _render(report) -> str:
    # Template rendering is synchronous CPU + file I/O: keep it off the event loop.
    return PDFGenerator().get_html_preview(report.model_dump())


def _has_value(val) -> bool:
    return val is not None and val != "" and val != "N/A"


def _report_has_identity(report) -> bool:
    def has_value(key):
        f = report.fields.get(key)
        return f is not None and _has_value(getattr(f, "value", None))

    return has_value("company_name") or has_value("legal_name") or has_value("cr_number")


# -----------------------------------------------------------------
# ENDPOINTS
# -----------------------------------------------------------------


@router.get("/html/{report_id}")
async def get_report_html(report_id: str):
    """Get rendered HTML for a report. Client converts to PDF."""
    report = await _load(report_id)
    html_content = await asyncio.to_thread(_render, report)

    if not html_content or len(html_content) < 100:
        raise HTTPException(400, "Report has no data to generate PDF")

    return HTMLResponse(content=html_content)


@router.post("/generate/{report_id}")
async def generate_report_pdf(report_id: str):
    """
    Return HTML for client-side PDF generation.
    The frontend fetches this HTML and converts it to PDF using html2pdf.js.
    """
    report = await _load(report_id)

    if not _report_has_identity(report):
        raise HTTPException(
            400, "Report has no data yet. Please use Easy Way Import first."
        )

    html_content = await asyncio.to_thread(_render, report)

    return {
        "success": True,
        "report_id": report_id,
        "engine": "client-side",
        "html": html_content,
        "message": "Use the returned HTML to generate PDF client-side with html2pdf.js",
    }


@router.get("/preview/{report_id}")
async def preview_report_html(report_id: str):
    """Preview rendered HTML in browser."""
    report = await _load(report_id)

    try:
        html_content = await asyncio.to_thread(_render, report)

        if not html_content or len(html_content) < 100:
            return HTMLResponse(
                content="<html><body><h1>Preview Error</h1><p>Report data may be empty.</p></body></html>"
            )

        return HTMLResponse(content=html_content)
    except Exception as e:
        print(f"[PDF] Preview error: {e}")
        return HTMLResponse(
            content="<html><body><h1>Preview Error</h1><p>Could not render preview.</p></body></html>"
        )


@router.get("/view/{report_id}")
async def view_report_html(report_id: str):
    """View rendered HTML in browser (alias for preview)."""
    return await preview_report_html(report_id)


@router.get("/status/{report_id}")
async def get_pdf_status(report_id: str):
    """Check PDF generation status (reads summary columns, not report_json)."""
    if not is_valid_report_id(report_id):
        raise HTTPException(400, "Invalid report_id format")
    try:
        row = await asyncio.to_thread(
            get_report_fields, report_id, "id,status,company_name,legal_name,cr_number"
        )
    except Exception as e:
        print(f"[PDF] Status lookup failed for {report_id}: {e}")
        raise HTTPException(500, "Failed to check report")
    if row is None:
        raise HTTPException(404, "Report not found")

    can_generate = any(
        _has_value(row.get(k)) for k in ("company_name", "legal_name", "cr_number")
    )
    status = row.get("status")
    if not can_generate:
        # The summary columns mirror these fields on every save; only an empty
        # (or legacy) row gets the full read to be sure.
        try:
            report = await get_report(None, report_id, strict=True)
        except InvalidReportDataError:
            report = None
        if report is not None:
            can_generate = _report_has_identity(report)
            status = report.status

    return {
        "report_id": report_id,
        "report_status": status,
        "can_generate": can_generate,
        "engine": "client-side (html2pdf.js)",
        "message": "PDF is generated in the browser",
    }
