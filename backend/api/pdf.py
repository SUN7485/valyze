from __future__ import annotations

"""
PDF API — Returns HTML for client-side PDF generation.
The frontend uses html2pdf.js to convert HTML to PDF in the browser.
No Gotenberg, no Playwright, no Docker needed.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from database.crud import get_report
from pdf_generator import PDFGenerator

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


# -----------------------------------------------------------------
# ENDPOINTS
# -----------------------------------------------------------------


@router.get("/html/{report_id}")
async def get_report_html(report_id: str):
    """Get rendered HTML for a report. Client converts to PDF."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(404, "Report not found")

    generator = PDFGenerator()
    html_content = generator.get_html_preview(report.model_dump())

    if not html_content or len(html_content) < 100:
        raise HTTPException(400, "Report has no data to generate PDF")

    return HTMLResponse(content=html_content)


@router.post("/generate/{report_id}")
async def generate_report_pdf(report_id: str):
    """
    Return HTML for client-side PDF generation.
    The frontend fetches this HTML and converts it to PDF using html2pdf.js.
    """
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(404, "Report not found")

    def has_value(key):
        f = report.fields.get(key)
        if f is None:
            return False
        val = (
            f.value
            if hasattr(f, "value")
            else (f.get("value") if isinstance(f, dict) else f)
        )
        return val is not None and val != "" and val != "N/A"

    has_data = (
        has_value("company_name") or has_value("legal_name") or has_value("cr_number")
    )

    if not has_data:
        raise HTTPException(
            400, "Report has no data yet. Please use Easy Way Import first."
        )

    generator = PDFGenerator()
    report_dict = report.model_dump()
    html_content = generator.get_html_preview(report_dict)

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
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(404, "Report not found")

    try:
        generator = PDFGenerator()
        html_content = generator.get_html_preview(report.model_dump())

        if not html_content or len(html_content) < 100:
            return HTMLResponse(
                content="<html><body><h1>Preview Error</h1><p>Report data may be empty.</p></body></html>"
            )

        return HTMLResponse(content=html_content)
    except Exception as e:
        return HTMLResponse(
            content=f"<html><body><h1>Preview Error</h1><p>{str(e)}</p></body></html>"
        )


@router.get("/view/{report_id}")
async def view_report_html(report_id: str):
    """View rendered HTML in browser (alias for preview)."""
    return await preview_report_html(report_id)


@router.get("/status/{report_id}")
async def get_pdf_status(report_id: str):
    """Check PDF generation status."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(404, "Report not found")

    def has_value(key):
        f = report.fields.get(key)
        if f is None:
            return False
        val = (
            f.value
            if hasattr(f, "value")
            else (f.get("value") if isinstance(f, dict) else f)
        )
        return val is not None and val != "" and val != "N/A"

    can_generate = (
        has_value("company_name") or has_value("legal_name") or has_value("cr_number")
    )

    return {
        "report_id": report_id,
        "report_status": report.status,
        "can_generate": can_generate,
        "engine": "client-side (html2pdf.js)",
        "message": "PDF is generated in the browser",
    }