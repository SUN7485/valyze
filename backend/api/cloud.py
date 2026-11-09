"""
Cloud API - Supabase is the only storage, so "cloud" is just the reports table.
Endpoints for checking a report's saved state and deleting reports.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user
from api.report import delete_report_or_raise
from services.report_queries import get_report_fields, is_valid_report_id

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


def _require_valid_id(report_id: str) -> None:
    if not is_valid_report_id(report_id):
        raise HTTPException(400, "Invalid report_id format")


def _saved_state(report_id: str):
    try:
        return get_report_fields(report_id, "id,updated_at")
    except Exception as e:
        print(f"[CLOUD] Lookup failed for {report_id}: {e}")
        raise HTTPException(500, "Failed to check report")


@router.post("/save/{report_id}")
def save_report_to_cloud(report_id: str):
    """Report the saved state; nothing is written.

    Every editor change is persisted to Supabase as it happens, so there is no
    separate "save to cloud" step. This returns when the report was last saved
    rather than claiming a save happened.
    """
    _require_valid_id(report_id)
    row = _saved_state(report_id)
    if not row:
        raise HTTPException(404, f"Report {report_id} not found")
    return {
        "success": True,
        "saved": False,
        "message": "Changes are saved automatically; nothing to do.",
        "report_id": report_id,
        "updated_at": row.get("updated_at"),
    }


@router.get("/status/{report_id}")
def get_cloud_status(report_id: str):
    """Check if report exists in Supabase."""
    _require_valid_id(report_id)
    row = _saved_state(report_id)
    return {
        "report_id": report_id,
        "in_cloud": row is not None,
        "last_synced": row.get("updated_at") if row else None,
    }


@router.delete("/{report_id}")
async def delete_from_cloud(report_id: str, user: dict = Depends(get_current_user)):
    """Delete a report (admin only). Same behaviour as DELETE /api/report/{id}."""
    await delete_report_or_raise(report_id, user)
    return {
        "success": True,
        "message": f"Report {report_id} deleted",
    }
