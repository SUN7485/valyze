"""
Cloud API - Save reports to Supabase.

Provides cloud backup and synchronization for reports.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database.crud import get_report
from database.db import get_db
from services import supabase_client

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


@router.post("/save/{report_id}")
async def save_report_to_cloud(report_id: str, db: AsyncSession = Depends(get_db)):
    """Save report to Supabase cloud."""
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(404, f"Report {report_id} not found")

    try:
        # Check if report exists in Supabase
        existing = supabase_client.get_report(report_id)

        report_dict = (
            report.model_dump() if hasattr(report, "model_dump") else dict(report)
        )

        print(f"[Cloud] Saving report {report_id}")
        print(
            f"[Cloud] Report keys: {report_dict.keys() if isinstance(report_dict, dict) else 'not dict'}"
        )
        if "fields" in report_dict:
            print(f"[Cloud] Fields: {list(report_dict['fields'].keys())[:5]}")

        if existing:
            # Update existing
            supabase_client.update_report(report_id, report_dict)
            return {
                "success": True,
                "message": "Report updated in cloud",
                "report_id": report_id,
            }
        else:
            # Create new
            supabase_client.create_report(report_id, report_dict)
            return {
                "success": True,
                "message": "Report saved to cloud",
                "report_id": report_id,
            }
    except Exception as e:
        print(f"[Cloud] Save error: {e}")
        raise HTTPException(500, f"Failed to save to cloud: {str(e)}")


@router.get("/status/{report_id}")
async def get_cloud_status(report_id: str, db: AsyncSession = Depends(get_db)):
    """Check if report exists in cloud."""
    try:
        existing = supabase_client.get_report(report_id)

        return {
            "report_id": report_id,
            "in_cloud": existing is not None,
            "last_synced": existing.get("updated_at") if existing else None,
        }
    except Exception as e:
        return {
            "report_id": report_id,
            "in_cloud": False,
            "error": str(e),
        }


@router.delete("/{report_id}")
async def delete_from_cloud(report_id: str):
    """Delete report from cloud."""
    try:
        supabase_client.delete_report(report_id)
        return {
            "success": True,
            "message": f"Report {report_id} deleted from cloud",
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to delete from cloud: {str(e)}")
