"""
Async CRUD operations — now backed by Supabase (replaces SQLite).
All functions accept a dummy `db` parameter for backward compatibility
but ignore it; they call Supabase REST API via services.supabase_client.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from types import SimpleNamespace

from services.supabase_client import (
    create_report as sb_create_report,
    get_report as sb_get_report,
    update_report as sb_update_report,
    delete_report as sb_delete_report,
    get_all_reports as sb_get_all_reports,
    add_uploaded_file as sb_add_uploaded_file,
    get_uploaded_files as sb_get_uploaded_files,
    delete_uploaded_file_by_report_and_filename as sb_delete_uploaded_file_fn,
)
from models.report_schema import FullReport, build_empty_report, FieldData
from models.field_meta import FIELD_REGISTRY


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _transform_report_row(row: Dict[str, Any]) -> dict:
    """Convert Supabase row to the shape expected by frontend code."""
    return {
        "id": row.get("id"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),  # already ISO string
        "updated_at": row.get("updated_at"),
        "company_name": row.get("company_name"),
        "legal_name": row.get("legal_name"),
        "cr_number": row.get("cr_number"),
        "client_reference": row.get("client_reference"),
        "country": row.get("country"),
        "analyst_name": row.get("analyst"),  # map to analyst_name
    }


# ---------------------------------------------------------------------------
# Report CRUD (async wrappers)
# ---------------------------------------------------------------------------


async def create_report(db, report_id: str, files_info=None) -> FullReport:
    """Create an empty report in Supabase and return the FullReport object."""
    try:
        report = build_empty_report(report_id)
        report_dict = report.model_dump()
        result = await asyncio.to_thread(sb_create_report, report_id, report_dict)
        if not result:
            raise Exception("Supabase returned empty response")
        return report
    except Exception as e:
        print(f"[CRUD] create_report failed: {e}")
        raise


async def get_report(db, report_id: str) -> Optional[FullReport]:
    """Fetch a report by ID and return a FullReport object."""
    data = await asyncio.to_thread(sb_get_report, report_id)
    if not data:
        return None
    report_json = data.get("report_json")
    if not report_json:
        return None
    # report_json may already be a dict (JSONB) or a JSON string
    if isinstance(report_json, str):
        try:
            report_json = json.loads(report_json)
        except json.JSONDecodeError:
            report_json = {}
    try:
        return FullReport.model_validate(report_json)
    except Exception as e:
        print(f"[CRUD] Failed to validate FullReport for {report_id}: {e}")
        return None


async def update_report_field(
    db,
    report_id: str,
    field_name: str,
    value: Any,
    confidence: str = "high",
    source: str = "user",
) -> Optional[FullReport]:
    """Update a single field in the report."""
    report = await get_report(db, report_id)
    if report is None:
        return None

    if field_name in report.fields:
        report.fields[field_name].value = value
        report.fields[field_name].confidence = confidence
        report.fields[field_name].source = source
    elif field_name in FIELD_REGISTRY:
        report.fields[field_name] = FieldData(
            value=value, confidence=confidence, source=source, locked=False
        )

    report.updated_at = datetime.now(timezone.utc).isoformat()
    await save_report_json(db, report_id, report)
    return report


async def update_report_fields_bulk(
    db,
    report_id: str,
    fields_dict: Dict[str, Any],
) -> Optional[FullReport]:
    """Update multiple fields at once."""
    report = await get_report(db, report_id)
    if report is None:
        return None

    for field_name, value in fields_dict.items():
        if field_name in report.fields:
            report.fields[field_name].value = value
            report.fields[field_name].confidence = "high"
            report.fields[field_name].source = "user"
        elif field_name in FIELD_REGISTRY:
            # Add new field (for backwards compatibility)
            report.fields[field_name] = FieldData(
                value=value,
                confidence="high",
                source="user",
                locked=False,
            )

    report.updated_at = datetime.now(timezone.utc).isoformat()
    await save_report_json(db, report_id, report)
    return report


async def save_report_json(db, report_id: str, json_data: Any) -> bool:
    """Save raw JSON data to report. Accepts FullReport object, dict, or JSON string."""
    try:
        if isinstance(json_data, str):
            try:
                json_data = json.loads(json_data)
            except json.JSONDecodeError:
                pass

        if isinstance(json_data, dict):
            report = FullReport.model_validate(json_data)
        else:
            report = json_data

        report_dict = report.model_dump()
        await asyncio.to_thread(sb_update_report, report_id, report_dict)
        return True
    except Exception as e:
        print(f"[CRUD] Error saving report JSON: {e}")
        return False





async def update_report_status(db, report_id: str, status: str) -> bool:
    """Update only the status column and save."""
    report = await get_report(db, report_id)
    if report is None:
        return False

    report.status = status
    report.updated_at = datetime.now(timezone.utc).isoformat()

    report_dict = report.model_dump()
    await asyncio.to_thread(sb_update_report, report_id, report_dict)
    return True


async def get_all_reports(db) -> List[dict]:
    """Return a lightweight list of all reports from Supabase."""
    rows = await asyncio.to_thread(sb_get_all_reports)
    return [_transform_report_row(row) for row in rows]


async def delete_report(db, report_id: str) -> bool:
    """Delete a report by ID."""
    success = await asyncio.to_thread(sb_delete_report, report_id)
    return success


async def get_report_json(db, report_id: str) -> Optional[str]:
    """Return the raw JSON string stored for a report."""
    data = await asyncio.to_thread(sb_get_report, report_id)
    if not data:
        return None
    report_json = data.get("report_json")
    if isinstance(report_json, str):
        return report_json
    return json.dumps(report_json) if report_json else None


async def add_uploaded_file(
    db, report_id: str, filename: str, file_path: str, file_type: str, file_size: int
) -> bool:
    """Add an uploaded file record."""
    success = await asyncio.to_thread(
        sb_add_uploaded_file, report_id, filename, file_path, file_type, file_size
    )
    return success


async def get_uploaded_files(db, report_id: str) -> List[dict]:
    """Return all uploaded file records for a report."""
    rows = await asyncio.to_thread(sb_get_uploaded_files, report_id)
    return rows


async def delete_uploaded_file(db, report_id: str, filename: str) -> bool:
    """Delete a single uploaded file record."""
    success = await asyncio.to_thread(sb_delete_uploaded_file_fn, report_id, filename)
    return success


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _calc_stats(report: FullReport):
    """Recalculate extraction statistics from current field values."""
    from models.report_schema import ExtractionStats

    total = len(report.fields)
    high = 0
    medium = 0
    missing = 0
    calculated = 0

    for fd in report.fields.values():
        if fd.confidence == "high":
            high += 1
        elif fd.confidence == "medium":
            medium += 1
        elif fd.confidence == "calculated":
            calculated += 1
        else:
            missing += 1

    return ExtractionStats(
        total_fields=total,
        high_confidence=high,
        medium_confidence=medium,
        missing=missing,
        calculated=calculated,
    )
