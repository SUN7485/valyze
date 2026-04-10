from __future__ import annotations

"""
PDF API using Gotenberg (Docker) for rendering.
No AI generation required - works with easy-way imported data.
"""

import os
import httpx
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from database.crud import get_report
from database.db import get_db
from pdf_generator import PDFGenerator

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

# Gotenberg URL - running in Docker
GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://localhost:3000")
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)


async def _html_to_pdf_gotenberg(
    html_content: str,
    report_id: str
) -> Optional[Path]:
    """
    Send HTML to Gotenberg and save PDF.
    Returns path to saved PDF or None on failure.
    """
    output_path = OUTPUT_DIR / f"{report_id}.pdf"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{GOTENBERG_URL}/forms/chromium/convert/html",
                files={
                    "files": (
                        "index.html",
                        html_content.encode("utf-8"),
                        "text/html"
                    ),
                },
                data={
                    "paperWidth":        "8.27",    # A4
                    "paperHeight":       "11.69",
                    "marginTop":         "0.39",    # 10mm
                    "marginBottom":      "0.39",
                    "marginLeft":        "0.39",
                    "marginRight":       "0.39",
                    "printBackground":   "true",
                    "preferCssPageSize": "true",
                },
            )

            if response.status_code == 200:
                output_path.write_bytes(response.content)
                print(f"[PDF] OK Gotenberg generated {output_path} "
                      f"({len(response.content)//1024} KB)")
                return output_path
            else:
                print(f"[PDF] ERROR Gotenberg error {response.status_code}: "
                      f"{response.text[:200]}")
                return None

    except httpx.ConnectError:
        print(f"[PDF] ERROR Cannot connect to Gotenberg at {GOTENBERG_URL}. "
              f"Is Docker running?")
        return None
    except Exception as e:
        print(f"[PDF] ERROR Gotenberg request failed: {e}")
        return None


async def _check_gotenberg() -> bool:
    """Check if Gotenberg is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{GOTENBERG_URL}/health")
            return r.status_code == 200
    except:
        return False


# -----------------------------------------------------------------
# ENDPOINTS
# -----------------------------------------------------------------

@router.post("/generate/{report_id}")
async def generate_report_pdf(
    report_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate PDF for any report that has data.
    Works with easy-way imported data immediately.
    No AI generation required.
    """
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(404, "Report not found")

    # Allow PDF for ANY status that has data
    # No longer require 'done' status
    def has_value(key):
        f = report.fields.get(key)
        if f is None:
            return False
        val = f.value if hasattr(f, "value") else (
            f.get("value") if isinstance(f, dict) else f
        )
        return val is not None and val != "" and val != "N/A"

    has_data = (
        has_value("company_name") or
        has_value("legal_name") or
        has_value("cr_number")
    )

    if not has_data:
        raise HTTPException(
            400,
            "Report has no data yet. "
            "Please use Easy Way Import first."
        )

    # Build HTML from template
    generator = PDFGenerator()
    report_dict = report.model_dump()
    html_content = generator.get_html_preview(report_dict)

    # Try Gotenberg first
    gotenberg_ok = await _check_gotenberg()

    if gotenberg_ok:
        pdf_path = await _html_to_pdf_gotenberg(html_content, report_id)
        if pdf_path:
            file_size_kb = round(pdf_path.stat().st_size / 1024, 1)
            return {
                "success":      True,
                "report_id":    report_id,
                "engine":       "gotenberg",
                "pdf_path":     str(pdf_path),
                "file_size_kb": file_size_kb,
                "download_url": f"/api/pdf/download/{report_id}",
            }

    # Fallback to Playwright
    print("[PDF] Gotenberg unavailable, falling back to Playwright...")
    result = await generator.generate_pdf(report_dict, report_id)

    if not result["success"]:
        raise HTTPException(
            500,
            f"PDF generation failed. "
            f"Gotenberg: {'offline' if not gotenberg_ok else 'error'}. "
            f"Playwright: {result.get('error','unknown error')}. "
            f"Check Docker is running: docker run -p 3000:3000 gotenberg/gotenberg:8"
        )

    return {
        "success":      True,
        "report_id":    report_id,
        "engine":       "playwright-fallback",
        "pdf_path":     result["pdf_path"],
        "file_size_kb": result.get("file_size_kb", 0),
        "download_url": f"/api/pdf/download/{report_id}",
    }


@router.get("/download/{report_id}")
async def download_report_pdf(
    report_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Download generated PDF."""
    pdf_path = OUTPUT_DIR / f"{report_id}.pdf"

    if not pdf_path.exists():
        raise HTTPException(
            404,
            "PDF not found. Generate it first via "
            "POST /api/pdf/generate/{report_id}"
        )

    report = await get_report(db, report_id)
    company_name = "Report"
    if report:
        f = report.fields.get("company_name") or report.fields.get("legal_name")
        if f:
            v = f.value if hasattr(f, "value") else (
                f.get("value") if isinstance(f, dict) else None
            )
            if v:
                company_name = v

    safe_name = str(company_name).replace(" ", "_")[:30]
    filename   = f"CreditReport_{safe_name}.pdf"

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename,
    )


@router.get("/preview/{report_id}")
async def preview_report_html(
    report_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Preview rendered HTML in browser.
    Generates PDF in background using Gotenberg if available.
    """
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(404, "Report not found")

    generator    = PDFGenerator()
    html_content = generator.get_html_preview(report.model_dump())

    return HTMLResponse(content=html_content)


@router.get("/status/{report_id}")
async def get_pdf_status(
    report_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Check PDF status and engine availability."""
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(404, "Report not found")

    pdf_path      = OUTPUT_DIR / f"{report_id}.pdf"
    exists        = pdf_path.exists()
    gotenberg_ok  = await _check_gotenberg()

    # Check if report has enough data to generate PDF
    def has_value(key):
        f = report.fields.get(key)
        if f is None:
            return False
        val = f.value if hasattr(f, "value") else (
            f.get("value") if isinstance(f, dict) else f
        )
        return val is not None and val != "" and val != "N/A"

    can_generate = (
        has_value("company_name") or
        has_value("legal_name") or
        has_value("cr_number")
    )

    return {
        "report_id":      report_id,
        "report_status":  report.status,
        "pdf_exists":     exists,
        "pdf_size_kb":    round(pdf_path.stat().st_size / 1024, 1)
                          if exists else None,
        "can_generate":   can_generate,
        "engine":         "gotenberg" if gotenberg_ok else "playwright",
        "gotenberg_url":  GOTENBERG_URL,
        "gotenberg_ok":   gotenberg_ok,
        "download_url":   f"/api/pdf/download/{report_id}" if exists else None,
    }