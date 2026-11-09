"""
Search API - Search and filter reports in Supabase.
All endpoints require authentication.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from api.report import delete_report_or_raise
from services.report_queries import is_valid_report_id, list_reports_page

# Handlers are plain `def` on purpose: they make blocking HTTP calls to
# Supabase, which FastAPI then runs in its threadpool instead of on the event loop.

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str = ""
    company_name: Optional[str] = None
    cr_number: Optional[str] = None
    country: Optional[str] = None
    client_reference: Optional[str] = None
    analyst: Optional[str] = None
    limit: int = 50


class SearchResponse(BaseModel):
    total: int
    reports: list


@router.post("/")
def search_reports(request: SearchRequest):
    """Search reports with various filters."""
    try:
        from services.supabase_client import search_reports as supabase_search

        results = supabase_search(
            query=request.query,
            company_name=request.company_name,
            cr_number=request.cr_number,
            country=request.country,
            client_reference=request.client_reference,
            analyst=request.analyst,
            limit=request.limit,
        )

        return {
            "total": len(results),
            "reports": results,
        }
    except Exception as e:
        print(f"[SEARCH] Search failed: {e}")
        raise HTTPException(500, "Search failed")


@router.get("/")
def search_reports_get(
    q: str = "",
    company_name: Optional[str] = None,
    cr_number: Optional[str] = None,
    country: Optional[str] = None,
    client_reference: Optional[str] = None,
    analyst: Optional[str] = None,
    limit: int = 50,
):
    """
    Search reports with GET request.

    Examples:
    - /api/search/?q=acme - search all fields for "acme"
    - /api/search/?company_name=Apple - filter by company name
    - /api/search/?country=UAE - filter by country
    - /api/search/?analyst=John - filter by analyst
    """
    try:
        from services.supabase_client import search_reports as supabase_search

        results = supabase_search(
            query=q,
            company_name=company_name,
            cr_number=cr_number,
            country=country,
            client_reference=client_reference,
            analyst=analyst,
            limit=limit,
        )

        return {
            "total": len(results),
            "reports": results,
        }
    except Exception as e:
        print(f"[SEARCH] Search failed: {e}")
        raise HTTPException(500, "Search failed")


@router.get("/reports")
def get_all_reports(limit: int = 100, offset: int = 0):
    """Get all reports from Supabase with pagination."""
    try:
        from services.supabase_client import (
            get_all_reports as get_all,
            get_reports_count,
        )

        results = get_all(limit=limit, offset=offset)
        total = get_reports_count()
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "reports": results,
        }
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(f"Get reports failed: {e}")
        raise HTTPException(500, "Failed to get reports")


@router.post("/load/{report_id}")
def load_report_from_cloud(report_id: str):
    """Fetch a report from Supabase (primary source). Legacy endpoint."""
    if not is_valid_report_id(report_id):
        raise HTTPException(400, "Invalid report_id format")
    try:
        from services.supabase_client import get_report as get_from_cloud

        cloud_report = get_from_cloud(report_id)
        if not cloud_report:
            raise HTTPException(404, f"Report {report_id} not found")

        return {
            "success": True,
            "report": cloud_report,
            "report_id": report_id,
            "company_name": cloud_report.get("company_name"),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[SEARCH] Failed to load report: {e}")
        raise HTTPException(500, "Failed to load report")


@router.get("/count")
def get_reports_count():
    """Get total reports count from Supabase."""
    try:
        from services.supabase_client import get_reports_count as get_count

        count = get_count()
        return {"total": count}
    except Exception as e:
        print(f"[SEARCH] Failed to get count: {e}")
        raise HTTPException(500, "Failed to get count")


# ---------------------------------------------------------------------------
# Local Database Reports
# ---------------------------------------------------------------------------


@router.get("/local")
def get_local_reports(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    """Get one page of reports; filtering, paging and counting run in PostgREST."""
    try:
        reports, total = list_reports_page(
            offset=skip,
            limit=limit,
            status=status,
            search=search,
            search_columns=("company_name", "cr_number", "client_reference"),
        )
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "reports": reports,
        }
    except Exception as e:
        print(f"[SEARCH] Failed to get reports: {e}")
        raise HTTPException(500, "Failed to get reports")


@router.get("/local/count")
def get_local_reports_count():
    """Get total count of reports (Supabase)."""
    try:
        from services.supabase_client import get_reports_count as get_count

        count = get_count()
        return {"total": count}
    except Exception as e:
        print(f"[SEARCH] Failed to get count: {e}")
        raise HTTPException(500, "Failed to get count")


@router.delete("/local/{report_id}")
async def delete_local_report(report_id: str, user: dict = Depends(get_current_user)):
    """Delete a report (admin only). Same behaviour as DELETE /api/report/{id}."""
    await delete_report_or_raise(report_id, user)
    return {
        "success": True,
        "message": f"Report {report_id} deleted",
    }


# ---------------------------------------------------------------------------
# Combined Reports (Cloud + Local)
# ---------------------------------------------------------------------------


@router.get("/all")
def get_all_reports_combined(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    country: Optional[str] = None,
):
    """One page of reports (newest first) with location 'cloud'.

    Search (company name / CR number, case-insensitive), the exact country
    filter, paging and the total all run in PostgREST, so reports beyond the
    first 1,000 are reachable and counted.
    """
    try:
        reports, total = list_reports_page(
            offset=skip,
            limit=limit,
            country=country,
            search=search,
            search_columns=("company_name", "cr_number"),
        )
        for r in reports:
            r["location"] = "cloud"
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "reports": reports,
        }
    except Exception as e:
        print(f"[SEARCH] Failed to get all reports: {e}")
        raise HTTPException(500, "Failed to get all reports")
