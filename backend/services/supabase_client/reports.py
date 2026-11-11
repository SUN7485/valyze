"""reports + uploaded_files tables."""

import json
import logging
import requests
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from ._core import _handle_response, get_base_url, get_headers

logger = logging.getLogger(__name__)


def create_report(report_id: str, report_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new report in Supabase."""
    print(f"[SUPABASE] create_report called: {report_id}")
    url = f"{get_base_url()}/reports"
    print(f"[SUPABASE] URL: {url}")

    # Extract fields - handle different formats
    fields = report_data.get("fields", {})
    if hasattr(fields, "model_dump"):
        fields = fields.model_dump()

    def get_field_value(key):
        """Get field value from various formats."""
        if fields is None:
            return None
        f = fields.get(key)
        if f is None:
            return None
        if isinstance(f, dict):
            return f.get("value") or f.get(None)
        return f

    data = {
        "id": report_id,
        "status": report_data.get("status", "uploading"),
        "report_json": report_data,
        "company_name": get_field_value("company_name"),
        "legal_name": get_field_value("legal_name"),
        "cr_number": get_field_value("cr_number"),
        "client_reference": get_field_value("client_reference"),
        "country": get_field_value("country"),
        "address": get_field_value("address"),
        # The report schema field is "analyst_name" (see start_company_work and the
        # extractor prompt); there is no bare "analyst" field, so this column was
        # always NULL and every report showed as Unassigned on the team page.
        "analyst": get_field_value("analyst_name") or get_field_value("analyst"),
    }
    print(f"[SUPABASE] Data to send: {json.dumps(data, default=str)[:200]}...")
    print(f"[SUPABASE] Headers: {get_headers()}")

    try:
        print("[SUPABASE] Making POST request...")
        response = requests.post(url, json=data, headers=get_headers(), timeout=30)
        print(f"[SUPABASE] Response status: {response.status_code}")
        print(f"[SUPABASE] Response text: {response.text[:500]}")

        if response.status_code in [200, 201]:
            result = response.json() if response.text else {}
            print(f"[SUPABASE] Success: {result}")
            return result
        # Handle error
        try:
            err_json = response.json()
            message = err_json.get('message', response.text[:200])
        except Exception:
            message = response.text[:200]
        if response.status_code == 409:
            print(f"[SUPABASE] Duplicate key ignored: {message}")
        else:
            raise Exception(f"Supabase create failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create request failed: {e}")
        print(f"[Supabase] Create request exception: {e}")
        import traceback
        traceback.print_exc()
        raise


def get_report(report_id: str) -> Optional[Dict[str, Any]]:
    """Get a report by ID."""
    url = f"{get_base_url()}/reports?id=eq.{report_id}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return results[0] if results else None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get report failed: {e}")
        return None


def get_report_by_cr_number(cr_number: str) -> Optional[Dict[str, Any]]:
    """Get a report by exact cr_number match."""
    if not cr_number:
        return None
    # URL-encode the cr_number
    import urllib.parse
    encoded = urllib.parse.quote(str(cr_number))
    url = f"{get_base_url()}/reports?cr_number=eq.{encoded}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return results[0] if results else None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get by CR failed: {e}")
        return None


def get_report_by_company_name(company_name: str) -> Optional[Dict[str, Any]]:
    """Get a report by exact company_name match."""
    if not company_name:
        return None
    import urllib.parse
    encoded = urllib.parse.quote(str(company_name))
    url = f"{get_base_url()}/reports?company_name=eq.{encoded}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return results[0] if results else None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get by company_name failed: {e}")
        return None


def get_report_by_client_reference(client_reference: str) -> Optional[Dict[str, Any]]:
    """Get a report by exact client_reference match."""
    if not client_reference:
        return None
    import urllib.parse
    encoded = urllib.parse.quote(str(client_reference))
    url = f"{get_base_url()}/reports?client_reference=eq.{encoded}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return results[0] if results else None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get by client_reference failed: {e}")
        return None


# Lightweight column set for report LISTS — never pull the heavy report_json blob
# when we only need summary fields. (report_json can be hundreds of KB each.)
REPORT_LIST_COLUMNS = (
    "id,status,created_at,updated_at,company_name,legal_name,"
    "cr_number,client_reference,country,analyst"
)


def search_reports(
    query: str = "",
    company_name: Optional[str] = None,
    cr_number: Optional[str] = None,
    country: Optional[str] = None,
    client_reference: Optional[str] = None,
    analyst: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Search reports (summary columns only), case-insensitive. Named filters are
    ANDed; the free-text `query` matches any of the common columns (OR)."""
    query_parts = [f"select={REPORT_LIST_COLUMNS}"]

    def _ilike(column: str, value: str) -> None:
        query_parts.append(f"{column}=ilike.%{quote(str(value).strip(), safe='')}%")

    if company_name:
        _ilike("company_name", company_name)
    if cr_number:
        _ilike("cr_number", cr_number)
    if country:
        _ilike("country", country)
    if client_reference:
        _ilike("client_reference", client_reference)
    if analyst:
        _ilike("analyst", analyst)
    if query and query.strip():
        q = quote(query.strip(), safe="")
        query_parts.append(
            f"or=(company_name.ilike.%{q}%,legal_name.ilike.%{q}%,"
            f"cr_number.ilike.%{q}%,client_reference.ilike.%{q}%)"
        )

    query_parts.append("order=updated_at.desc.nullslast")
    query_parts.append(f"limit={int(limit)}")

    url = f"{get_base_url()}/reports?{'&'.join(query_parts)}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Search reports failed: {e}")
        return []


def get_all_reports(limit: int = 1000, offset: int = 0) -> List[Dict[str, Any]]:
    """Get reports (summary columns only) with pagination, newest first."""
    url = (
        f"{get_base_url()}/reports"
        f"?select={REPORT_LIST_COLUMNS}"
        f"&order=updated_at.desc.nullslast"
        f"&limit={int(limit)}&offset={int(offset)}"
    )

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all reports failed: {e}")
        return []


def get_reports_count() -> int:
    """Get the count of reports using PostgREST's count header (no row transfer)."""
    url = f"{get_base_url()}/reports?select=id"
    headers = {**get_headers(), "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"}

    try:
        response = requests.get(url, headers=headers, timeout=30)
        content_range = response.headers.get("content-range") or response.headers.get("Content-Range")
        if content_range and "/" in content_range:
            total = content_range.rsplit("/", 1)[-1]
            if total.isdigit():
                return int(total)
        # Fallback: count the returned rows (should be at most 1 due to Range)
        return len(_handle_response(response))
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get reports count failed: {e}")
        return 0


def update_report(report_id: str, report_data: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing report."""
    url = f"{get_base_url()}/reports?id=eq.{report_id}"

    # Extract fields for the columns that exist in the reports table
    fields = report_data.get("fields", {})

    def get_field_value(field_name):
        f = fields.get(field_name, {})
        if isinstance(f, dict):
            return f.get("value")
        return None

    data = {
        "status": report_data.get("status"),
        "report_json": report_data,
        "company_name": get_field_value("company_name"),
        "legal_name": get_field_value("legal_name"),
        "cr_number": get_field_value("cr_number"),
        "client_reference": get_field_value("client_reference"),
        "country": get_field_value("country"),
        "address": get_field_value("address"),
        # The report schema field is "analyst_name" (see start_company_work and the
        # extractor prompt); there is no bare "analyst" field, so this column was
        # always NULL and every report showed as Unassigned on the team page.
        "analyst": get_field_value("analyst_name") or get_field_value("analyst"),
    }

    try:
        response = requests.patch(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 204]:
            return report_data
        # Non-successful response
        try:
            err_json = response.json()
            message = err_json.get('message', response.text[:200])
        except Exception:
            message = response.text[:200]
        if response.status_code == 409:
            print(f"[SUPABASE] Duplicate key ignored: {message}")
        else:
            raise Exception(f"Supabase update failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update request failed: {e}")
        raise


def delete_report(report_id: str) -> bool:
    """Delete a report."""
    url = f"{get_base_url()}/reports?id=eq.{report_id}"

    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete request failed: {e}")
        return False


def add_uploaded_file(
    report_id: str,
    filename: str,
    file_path: str,
    file_type: str,
    file_size: int,
    language: Optional[str] = None,
    pages: Optional[int] = None,
    processed: bool = False,
) -> Dict[str, Any]:
    """Record an uploaded file linked to a report."""
    url = get_base_url() + "/uploaded_files"
    data = {
        "report_id": report_id,
        "filename": filename,
        "file_path": file_path,
        "file_type": file_type,
        "file_size": file_size,
        "language": language,
        "pages": pages,
        "processed": processed,
    }
    try:
        response = requests.post(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201]:
            return response.json() if response.text else {}
        logger.error(
            f"[Supabase] Add uploaded file failed: {response.status_code} - {response.text[:200]}"
        )
        return {}
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Add uploaded file request failed: {e}")
        return {}


def get_uploaded_files(report_id: str) -> List[Dict[str, Any]]:
    """Get all uploaded files for a report."""
    url = f"{get_base_url()}/uploaded_files?report_id=eq.{report_id}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get uploaded files failed: {e}")
        return []


def delete_uploaded_file_by_report_and_filename(report_id: str, filename: str) -> bool:
    """Delete uploaded file(s) matching report_id and filename."""
    url = f"{get_base_url()}/uploaded_files?report_id=eq.{report_id}&filename=eq.{filename}"
    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete uploaded file failed: {e}")
        return False


def delete_uploaded_file_by_id(file_id: int) -> bool:
    """Delete uploaded file by its PK id."""
    url = f"{get_base_url()}/uploaded_files?id=eq.{file_id}"
    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete uploaded file failed: {e}")
        return False
