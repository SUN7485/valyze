"""
Async CRUD operations — now backed by Supabase (replaces SQLite).
All functions accept a dummy `db` parameter for backward compatibility
but ignore it; they call Supabase REST API via services.supabase_client.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from services.supabase_client import (
    create_report as sb_create_report,
    get_report as sb_get_report,
    get_all_reports as sb_get_all_reports,
    add_uploaded_file as sb_add_uploaded_file,
    get_uploaded_files as sb_get_uploaded_files,
    delete_uploaded_file_by_report_and_filename as sb_delete_uploaded_file_fn,
    get_report_by_cr_number as sb_get_report_by_cr_number,
    get_report_by_client_reference as sb_get_report_by_client_reference,
    get_report_by_company_name as sb_get_report_by_company_name,
)
from services.report_queries import (
    conditional_update_report,
    delete_report_cascade,
    get_report_updated_at,
)
from models.report_schema import FullReport, ReportArrays, build_empty_report, FieldData
from models.field_meta import is_known_field
from database.exceptions import (
    DuplicateReportError,
    FieldLockedError,
    InvalidArrayDataError,
    InvalidReportDataError,
    ReportConflictError,
    UnknownFieldError,
)


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


def _parse_report_json(report_json: Any) -> Tuple[Any, bool]:
    """Return (parsed report_json, stored_as_string)."""
    if isinstance(report_json, str):
        try:
            return json.loads(report_json), True
        except json.JSONDecodeError:
            return None, True
    return report_json, False


async def _read_report(report_id: str) -> Tuple[Optional[FullReport], bool]:
    """(report, stored_as_string). (None, False) when the row doesn't exist.
    Raises InvalidReportDataError when the row exists but report_json is
    empty or fails validation."""
    data = await asyncio.to_thread(sb_get_report, report_id)
    if not data:
        return None, False
    report_json, as_string = _parse_report_json(data.get("report_json"))
    if not report_json:
        print(f"[CRUD] Report {report_id} has empty report_json")
        raise InvalidReportDataError(report_id)
    try:
        return FullReport.model_validate(report_json), as_string
    except Exception as e:
        print(f"[CRUD] Failed to validate FullReport for {report_id}: {e}")
        raise InvalidReportDataError(report_id) from e


async def get_report(db, report_id: str, strict: bool = False) -> Optional[FullReport]:
    """Fetch a report by ID and return a FullReport object.

    None when the row doesn't exist. A row whose report_json is empty or invalid
    raises InvalidReportDataError when `strict` (API reads map it to 422);
    otherwise it is logged and treated as None for older callers.
    """
    try:
        report, _ = await _read_report(report_id)
        return report
    except InvalidReportDataError:
        if strict:
            raise
        return None


def _next_updated_at(previous: Optional[str]) -> str:
    now = datetime.now(timezone.utc).isoformat()
    if now == previous:  # same microsecond: keep the version token unique
        now = (datetime.now(timezone.utc) + timedelta(microseconds=1)).isoformat()
    return now


async def mutate_report(
    report_id: str,
    mutate: Callable[[FullReport], None],
    expected_updated_at: Optional[str] = None,
    retries: int = 3,
) -> Optional[FullReport]:
    """Read-modify-write a report with an atomic compare-and-set on updated_at.

    `mutate(report)` edits the model in place (it may raise to abort). The write
    only lands if report_json.updated_at is still what we read.
    - With `expected_updated_at` (the caller's last-known version): a mismatch,
      before or during the write, raises ReportConflictError.
    - Without it: a concurrent write makes us re-read and re-apply (up to
      `retries` times), so two quick edits to different fields both survive.
    Returns None when the report doesn't exist. updated_at is always bumped.
    """
    for _ in range(max(1, retries)):
        report, as_string = await _read_report(report_id)
        if report is None:
            return None
        if expected_updated_at is not None and report.updated_at != expected_updated_at:
            raise ReportConflictError(report.updated_at)
        base = report.updated_at
        mutate(report)
        report.updated_at = _next_updated_at(base)
        written = await asyncio.to_thread(
            conditional_update_report,
            report_id,
            report.model_dump(),
            None if as_string else base,
        )
        if written:
            return report
        exists, current = await asyncio.to_thread(get_report_updated_at, report_id)
        if not exists:
            return None
        if expected_updated_at is not None:
            raise ReportConflictError(current)
    raise ReportConflictError(current)


def _check_field_names(report: FullReport, names) -> None:
    unknown = [n for n in names if n not in report.fields and not is_known_field(n)]
    if unknown:
        raise UnknownFieldError(unknown)


def _set_field(report: FullReport, name: str, value: Any, confidence: str, source: str) -> None:
    existing = report.fields.get(name)
    if existing is not None:
        existing.value = value
        existing.confidence = confidence
        existing.source = source
    else:
        report.fields[name] = FieldData(
            value=value, confidence=confidence, source=source, locked=False
        )


async def update_report_field(
    db,
    report_id: str,
    field_name: str,
    value: Any,
    confidence: str = "high",
    source: str = "user",
    expected_updated_at: Optional[str] = None,
    respect_lock: bool = False,
) -> Optional[FullReport]:
    """Update a single field in the report (atomic; see mutate_report).

    Raises UnknownFieldError for a name that is neither on the report nor known,
    FieldLockedError when `respect_lock` and the field is locked, and
    ReportConflictError on a version mismatch.
    """

    def apply(report: FullReport) -> None:
        _check_field_names(report, [field_name])
        existing = report.fields.get(field_name)
        if respect_lock and existing is not None and existing.locked:
            raise FieldLockedError(field_name)
        _set_field(report, field_name, value, confidence, source)

    return await mutate_report(report_id, apply, expected_updated_at)


async def update_report_fields_bulk(
    db,
    report_id: str,
    fields_dict: Dict[str, Any],
    expected_updated_at: Optional[str] = None,
) -> Optional[FullReport]:
    """Update multiple fields at once (all or nothing; see update_report_field)."""

    def apply(report: FullReport) -> None:
        _check_field_names(report, list(fields_dict))
        for field_name, value in fields_dict.items():
            _set_field(report, field_name, value, "high", "user")

    return await mutate_report(report_id, apply, expected_updated_at)


async def update_report_array(
    db,
    report_id: str,
    array_name: str,
    items: List[Any],
    expected_updated_at: Optional[str] = None,
) -> Optional[FullReport]:
    """Replace one array (atomic; bumps updated_at). Raises InvalidArrayDataError
    when the items don't fit the array's schema."""

    def apply(report: FullReport) -> None:
        arrays_dict = report.arrays.model_dump()
        arrays_dict[array_name] = items
        try:
            report.arrays = ReportArrays.model_validate(arrays_dict)
        except Exception as e:
            print(f"[CRUD] Invalid items for array '{array_name}' on {report_id}: {e}")
            raise InvalidArrayDataError(array_name) from e

    return await mutate_report(report_id, apply, expected_updated_at)


async def update_report_status(db, report_id: str, status: str) -> bool:
    """Update only the status (atomic; bumps updated_at). False if not found."""

    def apply(report: FullReport) -> None:
        report.status = status

    return await mutate_report(report_id, apply) is not None


async def get_all_reports(db) -> List[dict]:
    """Return a lightweight list of all reports from Supabase."""
    rows = await asyncio.to_thread(sb_get_all_reports)
    return [_transform_report_row(row) for row in rows]


async def delete_report(db, report_id: str) -> bool:
    """Delete a report (and its uploaded_files rows) by ID, without reading or
    validating report_json first. True when a row was deleted, False when none
    matched. Raises ReportLinkedError if an order company still points at it."""
    return await asyncio.to_thread(delete_report_cascade, report_id)


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
