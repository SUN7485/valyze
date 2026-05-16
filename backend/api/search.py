"""
Search API - Search and filter reports in Supabase.
All endpoints require authentication.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


from services.auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"], dependencies=[Depends(get_current_user)])


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
async def get_all_reports(limit: int = 100, offset: int = 0):
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
        raise HTTPException(500, f"Failed to get reports: {str(e)}")


@router.post("/load/{report_id}")
async def load_report_from_cloud(report_id: str):
    """Fetch a report from Supabase (primary source). Legacy endpoint."""
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
        raise HTTPException(500, f"Failed to load report: {str(e)}")


@router.get("/count")
async def get_reports_count():
    """Get total reports count from Supabase."""
    try:
        from services.supabase_client import get_reports_count as get_count

        count = get_count()
        return {"total": count}
    except Exception as e:
        raise HTTPException(500, f"Failed to get count: {str(e)}")


# ---------------------------------------------------------------------------
# Local Database Reports
# ---------------------------------------------------------------------------


@router.get("/local")
async def get_local_reports(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    """Get reports from Supabase (local alias for compatibility)."""
    try:
        from services.supabase_client import get_all_reports as sb_get_all

        # Fetch all reports (Supabase returns already sorted by created_at desc)
        all_reports = await asyncio.to_thread(sb_get_all, limit=1000)

        # Filter by status if provided
        if status:
            all_reports = [r for r in all_reports if r.get("status") == status]

        # Filter by search if provided
        if search:
            search_lower = search.lower()
            all_reports = [
                r
                for r in all_reports
                if search_lower in (r.get("company_name") or "").lower()
                or search_lower in (r.get("cr_number") or "").lower()
                or search_lower in (r.get("client_reference") or "").lower()
            ]

        total = len(all_reports)
        reports = all_reports[skip : skip + limit]

        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "reports": reports,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get reports: {str(e)}")


@router.get("/local/count")
async def get_local_reports_count():
    """Get total count of reports (Supabase)."""
    try:
        from services.supabase_client import get_reports_count as get_count

        count = get_count()
        return {"total": count}
    except Exception as e:
        raise HTTPException(500, f"Failed to get count: {str(e)}")


@router.delete("/local/{report_id}")
async def delete_local_report(report_id: str):
    """Delete a report from Supabase."""
    try:
        from services.supabase_client import delete_report as sb_delete

        success = sb_delete(report_id)
        if not success:
            raise HTTPException(404, f"Report {report_id} not found")

        return {
            "success": True,
            "message": f"Report {report_id} deleted",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to delete report: {str(e)}")


# ---------------------------------------------------------------------------
# Combined Reports (Cloud + Local)
# ---------------------------------------------------------------------------


@router.get("/all")
async def get_all_reports_combined(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    country: Optional[str] = None,
):
    """Get all reports from Supabase with location 'cloud'."""
    try:
        from services.supabase_client import get_all_reports as sb_get_all

        all_reports = await asyncio.to_thread(sb_get_all)

        # Assign location = "cloud" for all (since all in Supabase)
        for r in all_reports:
            r["location"] = "cloud"

        # Apply search filter
        if search:
            search_lower = search.lower()
            all_reports = [
                r
                for r in all_reports
                if search_lower in (r.get("company_name") or "").lower()
                or search_lower in (r.get("cr_number") or "").lower()
            ]

        # Apply country filter
        if country:
            all_reports = [r for r in all_reports if r.get("country") == country]

        # Sort by updated_at descending
        all_reports.sort(
            key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True
        )

        total = len(all_reports)
        reports = all_reports[skip : skip + limit]

        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "reports": reports,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get all reports: {str(e)}")


# ---------------------------------------------------------------------------
# Output Folder Reports (Generated files: PDF, Excel, etc)
# ---------------------------------------------------------------------------


@router.get("/output")
async def get_output_reports(
    search: Optional[str] = None,
):
    """Get reports from output folder (generated PDF/Export files)."""
    try:
        output_dir = Path("outputs")

        if not output_dir.exists():
            return {"total": 0, "reports": []}

        # Get all files in output folder
        files = []
        for f in output_dir.iterdir():
            if f.is_file():
                name = f.stem
                parts = name.split("_", 1)
                report_id = parts[1] if len(parts) > 1 else parts[0]

                stat = f.stat()

                files.append(
                    {
                        "id": report_id,
                        "filename": f.name,
                        "format": f.suffix.replace(".", ""),
                        "size_kb": round(stat.st_size / 1024, 1),
                        "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
                        if stat.st_ctime
                        else None,
                        "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                        if stat.st_mtime
                        else None,
                    }
                )

        # Group by report_id
        reports_dict = {}
        for f in files:
            rid = f["id"]
            if rid not in reports_dict:
                reports_dict[rid] = {
                    "id": rid,
                    "files": [],
                    "updated_at": f["updated_at"],
                    "created_at": f["created_at"],
                }
            reports_dict[rid]["files"].append(
                {
                    "filename": f["filename"],
                    "format": f["format"],
                    "size_kb": f["size_kb"],
                }
            )

        all_reports = list(reports_dict.values())

        for r in all_reports:
            if r["files"]:
                r["filename"] = r["files"][0]["filename"]
                r["format"] = r["files"][0]["format"]

        if search:
            search_lower = search.lower()
            all_reports = [r for r in all_reports if search_lower in r["id"].lower()]

        all_reports.sort(key=lambda x: x.get("updated_at") or "", reverse=True)

        return {
            "total": len(all_reports),
            "reports": all_reports,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get output reports: {str(e)}")


@router.delete("/output/{report_id}")
async def delete_output_report(report_id: str):
    """Delete all output files for a report."""
    try:
        output_dir = Path("outputs")

        if not output_dir.exists():
            raise HTTPException(404, "Output folder not found")

        # Find and delete all files for this report
        deleted = []
        for f in output_dir.iterdir():
            if f.is_file():
                name = f.stem
                parts = name.split("_", 1)
                rid = parts[1] if len(parts) > 1 else parts[0]
                if rid == report_id:
                    f.unlink()
                    deleted.append(f.name)

        if not deleted:
            raise HTTPException(404, f"No output files found for report {report_id}")

        return {
            "success": True,
            "message": f"Deleted {len(deleted)} files",
            "deleted_files": deleted,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to delete output files: {str(e)}")
