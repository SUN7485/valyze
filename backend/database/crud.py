"""
Async CRUD operations for theValyze Credit report database.

All functions accept an AsyncSession and operate on the reports
and uploaded_files tables.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database.db import ReportRow, UploadedFileRow
from models.report_schema import FullReport, build_empty_report, FieldData
from models.field_meta import FIELD_REGISTRY


# ---------------------------------------------------------------------------
# Report CRUD
# ---------------------------------------------------------------------------


async def create_report(
    db: AsyncSession,
    report_id: str,
    files_info: Optional[List[dict]] = None,
) -> FullReport:
    """Create a new report row with an empty FullReport JSON."""
    report = build_empty_report(report_id)
    row = ReportRow(
        id=report_id,
        status=report.status,
        report_json=report.model_dump_json(),
        extraction_stats_json=report.extraction_stats.model_dump_json(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return report


async def get_report(db: AsyncSession, report_id: str) -> Optional[FullReport]:
    """Return the full FullReport object for a given report_id, or None."""
    result = await db.execute(select(ReportRow).where(ReportRow.id == report_id))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    if row.report_json:
        return FullReport.model_validate_json(row.report_json)
    return build_empty_report(report_id)


async def update_report_field(
    db: AsyncSession,
    report_id: str,
    field_name: str,
    value: Any,
    confidence: str = "high",
    source: str = "user",
) -> Optional[FullReport]:
    """Update a single field in the report JSON and persist."""
    report = await get_report(db, report_id)
    if report is None:
        return None

    # Allow updating existing fields or adding new registered fields
    if field_name in report.fields:
        report.fields[field_name].value = value
        report.fields[field_name].confidence = confidence
        report.fields[field_name].source = source
    elif field_name in FIELD_REGISTRY:
        # Add new field (for backwards compatibility with schema changes)
        report.fields[field_name] = FieldData(
            value=value,
            confidence=confidence,
            source=source,
            locked=False,
        )
    else:
        # Unknown field - log warning but don't fail
        print(f"[WARN] Attempt to update unknown field '{field_name}' - skipping")
        return report

    # Recalculate stats
    report.extraction_stats = _calc_stats(report)
    report.updated_at = datetime.now(timezone.utc).isoformat()

    await _save_report(db, report_id, report)
    return report


async def update_report_fields_bulk(
    db: AsyncSession,
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
        else:
            print(f"[WARN] Bulk update: unknown field '{field_name}' - skipping")

    report.extraction_stats = _calc_stats(report)
    report.updated_at = datetime.now(timezone.utc).isoformat()

    await _save_report(db, report_id, report)
    return report


async def update_report_status(
    db: AsyncSession,
    report_id: str,
    status: str,
) -> bool:
    """Update only the status column and the JSON status field."""
    report = await get_report(db, report_id)
    if report is None:
        return False

    report.status = status
    report.updated_at = datetime.now(timezone.utc).isoformat()

    await db.execute(
        update(ReportRow)
        .where(ReportRow.id == report_id)
        .values(
            status=status,
            report_json=report.model_dump_json(),
            updated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    return True


async def get_all_reports(db: AsyncSession) -> List[dict]:
    """Return a lightweight list of all reports."""
    result = await db.execute(select(ReportRow))
    rows = result.scalars().all()
    reports = []
    for row in rows:
        info: dict = {
            "id": row.id,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        # Extract all key fields from JSON
        if row.report_json:
            try:
                data = json.loads(row.report_json)
                fields = data.get("fields", {})
                # Extract all important fields
                field_keys = [
                    "company_name",
                    "legal_name",
                    "cr_number",
                    "client_reference",
                    "country",
                    "analyst_name",
                ]
                for key in field_keys:
                    field_data = fields.get(key, {})
                    if isinstance(field_data, dict):
                        info[key] = field_data.get("value")
                    elif field_data is not None:
                        # Fallback: maybe it's a direct value
                        info[key] = field_data
                    else:
                        info[key] = None
            except (json.JSONDecodeError, AttributeError) as e:
                print(f"[get_all_reports] Failed to parse JSON for {row.id}: {e}")
        reports.append(info)
    return reports


async def delete_report(db: AsyncSession, report_id: str) -> bool:
    """Delete a report and all associated file records."""
    await db.execute(
        delete(UploadedFileRow).where(UploadedFileRow.report_id == report_id)
    )
    result = await db.execute(delete(ReportRow).where(ReportRow.id == report_id))
    await db.commit()
    return result.rowcount > 0


async def save_report_json(
    db: AsyncSession,
    report_id: str,
    full_json: str,
) -> bool:
    """Overwrite the report_json column with the given JSON string."""
    print(f"[SAVE] Starting save_report_json for {report_id}")
    try:
        result = await db.execute(
            update(ReportRow)
            .where(ReportRow.id == report_id)
            .values(
                report_json=full_json,
                updated_at=datetime.now(timezone.utc),
            )
        )
        print(f"[SAVE] Execute returned, rowcount: {result.rowcount}")
        await db.commit()
        print(f"[SAVE] Commit successful for {report_id}")
        return result.rowcount > 0
    except Exception as e:
        print(f"[SAVE] ERROR in save_report_json: {e}")
        import traceback

        traceback.print_exc()
        return False


async def get_report_json(db: AsyncSession, report_id: str) -> Optional[str]:
    """Return the raw JSON string stored for a report."""
    result = await db.execute(select(ReportRow).where(ReportRow.id == report_id))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    return row.report_json


# ---------------------------------------------------------------------------
# Uploaded files helpers
# ---------------------------------------------------------------------------


async def add_uploaded_file(
    db: AsyncSession,
    report_id: str,
    filename: str,
    file_path: str,
    file_type: str,
    file_size: int,
) -> UploadedFileRow:
    """Record a newly uploaded file."""
    row = UploadedFileRow(
        report_id=report_id,
        filename=filename,
        file_path=file_path,
        file_type=file_type,
        file_size=file_size,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_uploaded_files(db: AsyncSession, report_id: str) -> List[UploadedFileRow]:
    """Return all uploaded file records for a report."""
    result = await db.execute(
        select(UploadedFileRow).where(UploadedFileRow.report_id == report_id)
    )
    return list(result.scalars().all())


async def delete_uploaded_file(db: AsyncSession, report_id: str, filename: str) -> bool:
    """Delete a single uploaded file record by report_id and filename."""
    result = await db.execute(
        delete(UploadedFileRow).where(
            UploadedFileRow.report_id == report_id,
            UploadedFileRow.filename == filename,
        )
    )
    await db.commit()
    return result.rowcount > 0


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _save_report(db: AsyncSession, report_id: str, report: FullReport):
    """Persist the full report JSON back to the database."""
    await db.execute(
        update(ReportRow)
        .where(ReportRow.id == report_id)
        .values(
            report_json=report.model_dump_json(),
            extraction_stats_json=report.extraction_stats.model_dump_json(),
            updated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()


async def save_report_json(db: AsyncSession, report_id: str, json_data: Any) -> bool:
    """Save raw JSON data to report. Accepts FullReport object or dict."""
    try:
        if isinstance(json_data, dict):
            report = FullReport.model_validate(json_data)
        else:
            report = FullReport.model_validate_json(json_data)

        await _save_report(db, report_id, report)
        return True
    except Exception as e:
        print(f"[CRUD] Error saving report JSON: {e}")
        return False


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
