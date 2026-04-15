"""
Search API - Search and filter reports in Supabase.

Supports searching by:
- Client Name
- Report ID
- Client Reference
- Company Name
- Country
- Address
- CR No.
- Analyst
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

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
async def search_reports(request: SearchRequest):
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
        raise HTTPException(500, f"Search failed: {str(e)}")


@router.get("/")
async def search_reports_get(
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
        raise HTTPException(500, f"Search failed: {str(e)}")


@router.get("/reports")
async def get_all_reports(limit: int = 100):
    """Get all reports."""
    try:
        from services.supabase_client import get_all_reports as get_all

        results = get_all(limit=limit)
        return {
            "total": len(results),
            "reports": results,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get reports: {str(e)}")


@router.get("/count")
async def get_reports_count():
    """Get total reports count."""
    try:
        from services.supabase_client import get_reports_count as get_count

        count = get_count()
        return {"total": count}
    except Exception as e:
        raise HTTPException(500, f"Failed to get count: {str(e)}")
