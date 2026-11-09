"""
PostgREST helpers for the reports area (report editor, import, search, delete).

Kept apart from services/supabase_client.py on purpose. Every value is
percent-encoded exactly once (see _qs), so Arabic text, spaces and `+` in
timestamps reach PostgREST intact. Functions raise ReportQueryError on HTTP or
transport failures instead of returning an empty result that looks like "no rows".
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import requests

from services.supabase_client import get_base_url, get_headers

logger = logging.getLogger(__name__)

REPORT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,100}$")

# Summary columns for report lists: never pull the heavy report_json blob.
REPORT_LIST_COLUMNS = (
    "id,status,created_at,updated_at,company_name,legal_name,"
    "cr_number,client_reference,country,analyst"
)

MAX_PAGE_SIZE = 1000
_TIMEOUT = 30


class ReportQueryError(Exception):
    """A PostgREST call failed (HTTP error or transport failure)."""


class ReportLinkedError(Exception):
    """The report is still referenced by another row (e.g. an order company)."""


def is_valid_report_id(report_id: Any) -> bool:
    return isinstance(report_id, str) and bool(REPORT_ID_PATTERN.match(report_id))


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------


def _qs(params: List[Tuple[str, Any]]) -> str:
    """Encode (key, value) pairs, each value percent-encoded exactly once."""
    return "&".join(
        f"{quote(str(k), safe='')}={quote(str(v), safe='')}" for k, v in params
    )


def _url(table: str, params: List[Tuple[str, Any]]) -> str:
    return f"{get_base_url()}/{table}?{_qs(params)}"


def _quoted(value: Any) -> str:
    """Double-quote a value for use inside or=(...): commas, dots and
    parentheses become literal; backslashes and quotes are escaped."""
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def _request(method: str, url: str, **kwargs) -> requests.Response:
    try:
        return requests.request(method, url, timeout=_TIMEOUT, **kwargs)
    except requests.exceptions.RequestException as e:
        logger.error(f"[report_queries] {method} failed: {e}")
        raise ReportQueryError("Database request failed") from e


def _raise_for_status(response: requests.Response, what: str) -> None:
    if response.status_code >= 400:
        logger.error(
            f"[report_queries] {what} failed ({response.status_code}): {response.text[:200]}"
        )
        raise ReportQueryError(f"{what} failed")


def _json_list(response: requests.Response) -> List[Dict[str, Any]]:
    if not response.text:
        return []
    try:
        data = response.json()
    except ValueError:
        return []
    if isinstance(data, list):
        return data
    return [data] if isinstance(data, dict) else []


def _total_from_content_range(response: requests.Response) -> Optional[int]:
    content_range = response.headers.get("content-range") or ""
    if "/" in content_range:
        total = content_range.rsplit("/", 1)[-1]
        if total.isdigit():
            return int(total)
    return None


# ---------------------------------------------------------------------------
# Report rows
# ---------------------------------------------------------------------------


def report_columns_from_dict(report_dict: Dict[str, Any]) -> Dict[str, Any]:
    """The reports-table columns derived from a FullReport dict (mirrors
    supabase_client.update_report so list views stay in sync)."""
    fields = report_dict.get("fields") or {}

    def fv(name: str):
        f = fields.get(name)
        return f.get("value") if isinstance(f, dict) else None

    return {
        "status": report_dict.get("status"),
        "report_json": report_dict,
        "company_name": fv("company_name"),
        "legal_name": fv("legal_name"),
        "cr_number": fv("cr_number"),
        "client_reference": fv("client_reference"),
        "country": fv("country"),
        "address": fv("address"),
        "analyst": fv("analyst_name") or fv("analyst"),
    }


def conditional_update_report(
    report_id: str,
    report_dict: Dict[str, Any],
    expected_updated_at: Optional[str],
) -> bool:
    """Write the report only if its stored report_json.updated_at still equals
    `expected_updated_at` (atomic compare-and-set in one PATCH).

    Returns True when a row was written, False when nothing matched (the report
    changed meanwhile, or no longer exists). `expected_updated_at=None` writes
    unconditionally (legacy rows whose report_json isn't an object).
    """
    params: List[Tuple[str, Any]] = [("id", f"eq.{report_id}")]
    if expected_updated_at is not None:
        params.append(("report_json->>updated_at", f"eq.{expected_updated_at}"))
    params.append(("select", "id"))

    data = report_columns_from_dict(report_dict)
    # Keep the column in step with the JSON copy (list views sort on it).
    if report_dict.get("updated_at"):
        data["updated_at"] = report_dict["updated_at"]

    headers = {**get_headers(), "Prefer": "return=representation"}
    response = _request("PATCH", _url("reports", params), json=data, headers=headers)
    _raise_for_status(response, "Report update")
    return len(_json_list(response)) > 0


def get_report_fields(report_id: str, select: str) -> Optional[Dict[str, Any]]:
    """Fetch only `select` (PostgREST select syntax) for one report; None if absent."""
    params = [("id", f"eq.{report_id}"), ("select", select), ("limit", 1)]
    response = _request("GET", _url("reports", params), headers=get_headers())
    _raise_for_status(response, "Report lookup")
    rows = _json_list(response)
    return rows[0] if rows else None


def get_report_updated_at(report_id: str) -> Tuple[bool, Optional[str]]:
    """(exists, report_json.updated_at) without transferring report_json."""
    row = get_report_fields(report_id, "id,json_updated_at:report_json->>updated_at")
    if row is None:
        return False, None
    return True, row.get("json_updated_at")


def list_reports_page(
    *,
    offset: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    country: Optional[str] = None,
    search: Optional[str] = None,
    search_columns: Tuple[str, ...] = ("company_name", "cr_number"),
) -> Tuple[List[Dict[str, Any]], int]:
    """One page of report summaries, filtered and paginated by PostgREST.

    Returns (rows, total matching rows). `search` is a case-insensitive
    substring match on any of `search_columns`.
    """
    offset = max(0, int(offset))
    limit = max(1, min(int(limit), MAX_PAGE_SIZE))
    params: List[Tuple[str, Any]] = [("select", REPORT_LIST_COLUMNS)]
    if status:
        params.append(("status", f"eq.{status}"))
    if country:
        params.append(("country", f"eq.{country}"))
    if search and search.strip():
        pattern = _quoted(f"*{search.strip()}*")
        params.append(
            ("or", "(" + ",".join(f"{c}.ilike.{pattern}" for c in search_columns) + ")")
        )
    params += [
        ("order", "updated_at.desc.nullslast,created_at.desc.nullslast"),
        ("limit", limit),
        ("offset", offset),
    ]
    headers = {**get_headers(), "Prefer": "count=exact"}
    response = _request("GET", _url("reports", params), headers=headers)
    total = _total_from_content_range(response)
    if response.status_code == 416:
        # Offset past the end: PostgREST answers "range not satisfiable".
        return [], total or 0
    _raise_for_status(response, "Report list")
    rows = _json_list(response)
    return rows, (total if total is not None else offset + len(rows))


# ---------------------------------------------------------------------------
# Related rows
# ---------------------------------------------------------------------------


def get_order_companies_for_report(report_id: str) -> List[Dict[str, Any]]:
    """order_companies rows linked to this report (slim columns)."""
    params = [("report_id", f"eq.{report_id}"), ("select", "id,order_id,status,report_id")]
    response = _request("GET", _url("order_companies", params), headers=get_headers())
    _raise_for_status(response, "Order-company lookup")
    return _json_list(response)


def delete_report_cascade(report_id: str) -> bool:
    """Delete a report and its uploaded_files rows.

    Returns True when the report row was deleted, False when it didn't exist.
    Raises ReportLinkedError when another table (order_companies) still points
    at it. Storage objects are NOT removed: portal files are shared with
    order_files (the same storage:// path), so deleting them would break the
    order's own downloads.
    """
    headers = {**get_headers(), "Prefer": "return=minimal"}
    response = _request(
        "DELETE",
        _url("uploaded_files", [("report_id", f"eq.{report_id}")]),
        headers=headers,
    )
    _raise_for_status(response, "Uploaded-file cleanup")

    headers = {**get_headers(), "Prefer": "return=representation"}
    response = _request(
        "DELETE",
        _url("reports", [("id", f"eq.{report_id}"), ("select", "id")]),
        headers=headers,
    )
    if response.status_code == 409 and "23503" in (response.text or ""):
        raise ReportLinkedError(report_id)
    _raise_for_status(response, "Report delete")
    return len(_json_list(response)) > 0
