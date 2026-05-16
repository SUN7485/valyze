"""
Cloud API - Supabase operations (now primary storage).
Endpoints for saving, status checking, and deleting reports in Supabase.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException


from services import supabase_client

from services.auth import get_current_user

router = APIRouter(prefix="/api/cloud", tags=["cloud"], dependencies=[Depends(get_current_user)])


@router.post("/save/{report_id}")
async def save_report_to_cloud(report_id: str):
    """Save/update a report in Supabase.

    In Supabase-only architecture, reports are always in cloud.
    This endpoint verifies existence and returns success.
    """
    existing = supabase_client.get_report(report_id)
    if not existing:
        raise HTTPException(404, f"Report {report_id} not found")
    return {
        "success": True,
        "message": "Report already in cloud",
        "report_id": report_id,
    }


@router.get("/status/{report_id}")
async def get_cloud_status(report_id: str):
    """Check if report exists in Supabase."""
    existing = supabase_client.get_report(report_id)
    return {
        "report_id": report_id,
        "in_cloud": existing is not None,
        "last_synced": existing.get("updated_at") if existing else None,
    }


@router.delete("/{report_id}")
async def delete_from_cloud(report_id: str):
    """Delete report from Supabase."""
    try:
        supabase_client.delete_report(report_id)
        return {
            "success": True,
            "message": f"Report {report_id} deleted",
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to delete: {str(e)}")
