"""
Supabase client service for Valyze Credit Reports.
Uses direct HTTP calls to avoid complex dependency issues.
"""

import json
import os
import re
import logging
import requests
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)


def get_headers() -> Dict[str, str]:
    """Get headers for Supabase API calls."""
    return {
        "apikey": os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_ANON_KEY", ""),
        "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY', '')}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def get_base_url() -> str:
    """Get Supabase base URL."""
    return f"{os.getenv('SUPABASE_URL')}/rest/v1"


# ---------------------------------------------------------------------------
# Report Operations (using direct HTTP)
# ---------------------------------------------------------------------------


def _handle_response(response: requests.Response) -> List[Dict[str, Any]]:
    """Handle API response with proper error handling."""
    try:
        if response.status_code >= 400:
            logger.error(
                f"[Supabase] API Error {response.status_code}: {response.text[:200]}"
            )
            return []
        try:
            return response.json() if response.text else []
        except Exception as e:
            logger.warning(f"[Supabase] JSON parse error: {e}")
            return []
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Request failed: {e}")
        return []


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
        "analyst": get_field_value("analyst"),
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


# ---------------------------------------------------------------------------
# Client Operations (using direct HTTP)
# ---------------------------------------------------------------------------


def _single_from_response(response: requests.Response) -> Optional[Dict[str, Any]]:
    """Return the first object from a Supabase response."""
    try:
        if response.status_code >= 400:
            logger.error(
                f"[Supabase] API Error {response.status_code}: {response.text[:200]}"
            )
            return None
        try:
            data = response.json() if response.text else None
        except Exception as e:
            logger.warning(f"[Supabase] JSON parse error: {e}")
            return None
        if isinstance(data, list):
            return data[0] if data else None
        return data if isinstance(data, dict) else None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Request failed: {e}")
        return None


def _generate_valyze_id_from_rpc() -> Optional[str]:
    url = f"{get_base_url()}/rpc/next_valyze_id"
    try:
        response = requests.post(url, json={}, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201] and response.text:
            data = response.json()
            if isinstance(data, str) and data:
                return data
            if isinstance(data, list) and data:
                return str(data[0])
            if isinstance(data, dict):
                for key in ["result", "p_next_valyze_id", "valyze_id"]:
                    if data.get(key):
                        return str(data[key])
                first_value = next(iter(data.values()), None)
                if first_value:
                    return str(first_value)
    except Exception as e:
        logger.warning(f"[Supabase] next_valyze_id RPC failed, falling back: {e}")
    return None


def _generate_valyze_id_from_max() -> str:
    url = f"{get_base_url()}/clients?select=valyze_id&order=valyze_id.desc.nullslast&limit=1"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        rows = _handle_response(response)
        max_number = 0
        for row in rows:
            match = re.search(r"(\d+)$", row.get("valyze_id") or "")
            if match:
                max_number = max(max_number, int(match.group(1)))
        return f"VLZ-{max_number + 1:04d}"
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Generate valyze_id fallback failed: {e}")
        return "VLZ-0001"


def _generate_valyze_id() -> str:
    return _generate_valyze_id_from_rpc() or _generate_valyze_id_from_max()


def get_all_clients(search: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all clients with optional search across name, ID, and email."""
    url = f"{get_base_url()}/clients?select=*&order=client_name.asc.nullslast"
    if search:
        search_term = search.strip()
        if search_term:
            encoded_term = quote(search_term, safe="")
            or_filter = quote(
                f"(client_name.ilike.%{encoded_term}%,valyze_id.ilike.%{encoded_term}%,email.ilike.%{encoded_term}%)",
                safe="",
            )
            url += f"&or={or_filter}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all clients failed: {e}")
        return []


def get_client(client_id: str) -> Optional[Dict[str, Any]]:
    """Get a client by id."""
    url = f"{get_base_url()}/clients?id=eq.{quote(client_id, safe='')}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get client failed: {e}")
        return None


def create_client(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new client."""
    payload = dict(data)
    if not payload.get("valyze_id"):
        payload["valyze_id"] = _generate_valyze_id()

    url = f"{get_base_url()}/clients"
    try:
        response = requests.post(url, json=payload, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201]:
            result = response.json() if response.text else {}
            return result[0] if isinstance(result, list) else result
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase create client failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create client request failed: {e}")
        raise


def update_client(client_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing client."""
    if not data:
        return get_client(client_id)

    url = f"{get_base_url()}/clients?id=eq.{quote(client_id, safe='')}"
    try:
        response = requests.patch(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 204]:
            if not response.text:
                updated = get_client(client_id) or {}
                updated.update(data)
                return updated
            result = response.json()
            return result[0] if isinstance(result, list) else result
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase update client failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update client request failed: {e}")
        raise


def delete_client(client_id: str) -> bool:
    """Delete a client."""
    url = f"{get_base_url()}/clients?id=eq.{quote(client_id, safe='')}"
    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete client request failed: {e}")
        return False


def get_client_sessions(client_id: str) -> List[Dict[str, Any]]:
    """Get all sessions for a client."""
    url = (
        f"{get_base_url()}/client_sessions?"
        f"client_id=eq.{quote(client_id, safe='')}&order=created_at.desc.nullslast"
    )
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get client sessions failed: {e}")
        return []


def create_client_session(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new client session."""
    url = f"{get_base_url()}/client_sessions"
    try:
        response = requests.post(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201]:
            result = response.json() if response.text else {}
            return result[0] if isinstance(result, list) else result
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase create client session failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create client session request failed: {e}")
        raise


def get_session_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Get a client session by token."""
    url = f"{get_base_url()}/client_sessions?token=eq.{quote(token, safe='')}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get session by token failed: {e}")
        return None


def _get_session(session_id: str) -> Optional[Dict[str, Any]]:
    url = f"{get_base_url()}/client_sessions?id=eq.{quote(session_id, safe='')}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get session failed: {e}")
        return None


def increment_session_usage(session_id: str) -> Optional[Dict[str, Any]]:
    """Increment used_count by one for a client session."""
    session = _get_session(session_id)
    if not session:
        return None

    patch_data = {"used_count": int(session.get("used_count") or 0) + 1}
    url = f"{get_base_url()}/client_sessions?id=eq.{quote(session_id, safe='')}"
    try:
        response = requests.patch(url, json=patch_data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 204]:
            if not response.text:
                updated = dict(session)
                updated.update(patch_data)
                return updated
            result = response.json()
            return result[0] if isinstance(result, list) else result
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase increment session usage failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Increment session usage request failed: {e}")
        raise


def get_orders_for_client(client_id: str) -> List[Dict[str, Any]]:
    """Get all orders for a client."""
    url = (
        f"{get_base_url()}/orders?select=id,order_number,date_received,status,"
        f"company_count,service_level&client_id=eq.{quote(client_id, safe='')}"
        f"&order=created_at.desc.nullslast"
    )
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get orders for client failed: {e}")
        return []


def get_orders_for_clients(client_ids: List[str]) -> List[Dict[str, Any]]:
    """Get order IDs for multiple clients."""
    if not client_ids:
        return []

    encoded_ids = ",".join(quote(client_id, safe="") for client_id in client_ids)
    url = f"{get_base_url()}/orders?select=id,client_id,company_count,completed_count&client_id=in.({encoded_ids})"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get orders for clients failed: {e}")
        return []


def get_completed_order_companies_count(order_ids: List[str]) -> int:
    """Count completed order companies for a set of order IDs."""
    if not order_ids:
        return 0

    encoded_ids = ",".join(quote(order_id, safe="") for order_id in order_ids)
    url = (
        f"{get_base_url()}/order_companies?select=id&order_id=in.({encoded_ids})"
        f"&status=eq.completed"
    )
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return len(_handle_response(response))
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get completed order companies failed: {e}")
        return 0



def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get a single client session by ID."""
    url = f"{get_base_url()}/client_sessions?id=eq.{quote(session_id, safe='')}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return results[0] if results else None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get session request failed: {e}")
        return None


def update_session(session_id: str, data: Dict[str, Any]) -> bool:
    """Update a client session."""
    url = f"{get_base_url()}/client_sessions?id=eq.{quote(session_id, safe='')}"
    try:
        response = requests.patch(url, json=data, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update session request failed: {e}")
        return False



def delete_session(session_id: str) -> bool:
    """Delete a client session."""
    url = f"{get_base_url()}/client_sessions?id=eq.{quote(session_id, safe='')}"
    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete session request failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Update Report
# ---------------------------------------------------------------------------


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
        "analyst": get_field_value("analyst"),
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


# ---------------------------------------------------------------------------
# Uploaded File Operations
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Search & Count
# ---------------------------------------------------------------------------
# Client wrapper for compatibility
# ---------------------------------------------------------------------------


class SupabaseClient:
    """Wrapper for compatibility with existing code."""

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    def table(self, table_name):
        return TableProxy(table_name, self.url, self.key)


class TableProxy:
    def __init__(self, table: str, url: str, key: str):
        self._table = table
        self._url = url
        self._key = key
        self._filters = []

    def select(self, columns="*"):
        self._columns = columns
        return self

    def insert(self, data):
        url = f"{self._url}/rest/v1/{self._table}"
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        response = requests.post(url, json=data, headers=headers)
        return Response(response)

    def limit(self, n):
        self._limit = n
        return self


class Response:
    def __init__(self, response: requests.Response):
        self.response = response

    @property
    def data(self):
        try:
            return self.response.json() if self.response.text else []
        except:
            return []


# Create singleton instance for backward compatibility


class _Client:
    """Fake client for compatibility."""

    def table(self, name):
        return TableProxy(
            name, os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_KEY", "")
        )


_client = _Client()


def get_supabase():
    return _client


def init_supabase():
    return _client


# ---------------------------------------------------------------------------
# Order Operations
# ---------------------------------------------------------------------------


def get_all_orders(
    filters: Optional[Dict[str, Any]] = None,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    analyst: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get all orders with optional filters. Sorted by created_at DESC."""
    params = dict(filters or {})
    status = params.pop("status", status)
    client_id = params.pop("client_id", client_id)
    analyst = params.pop("analyst", analyst)

    select = "*,client:clients(client_name,valyze_id,email)"
    query = [f"select={quote(select, safe='(),*')}"]
    if status:
        query.append(f"status=eq.{quote(status, safe='')}")
    if client_id:
        query.append(f"client_id=eq.{quote(client_id, safe='')}")
    if analyst:
        query.append(f"auto_assigned_analyst=eq.{quote(analyst, safe='')}")
    for key, value in params.items():
        if value is not None:
            query.append(f"{key}=eq.{quote(str(value), safe='')}")
    query.append("order=created_at.desc.nullslast")

    url = f"{get_base_url()}/orders?{'&'.join(query)}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all orders failed: {e}")
        return []


def get_order(order_id: str) -> Optional[Dict[str, Any]]:
    """Get a single order with joined client data."""
    url = (
        f"{get_base_url()}/orders?"
        f"id=eq.{quote(order_id, safe='')}&"
        f"select=*,client:clients(client_name,valyze_id,email)"
    )

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get order failed: {e}")
        return None


def get_order_with_client(order_id: str) -> Optional[Dict[str, Any]]:
    """Compatibility wrapper for get_order."""
    return get_order(order_id)


def create_order(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Create a new order in Supabase."""
    url = f"{get_base_url()}/orders"

    try:
        response = requests.post(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201]:
            result = response.json() if response.text else {}
            return _single_from_response(response)
        if response.status_code == 409:
            logger.warning(f"[Supabase] Duplicate order ignored: {response.text[:200]}")
            return None
        raise Exception(
            f"Supabase create order failed ({response.status_code}): {response.text[:200]}"
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create order request failed: {e}")
        raise


def update_order(order_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing order and return the updated row."""
    if not data:
        return get_order(order_id)

    url = f"{get_base_url()}/orders?id=eq.{quote(order_id, safe='')}"

    try:
        response = requests.patch(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 204]:
            if not response.text:
                return get_order(order_id)
            return _single_from_response(response)
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase update order failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update order failed: {e}")
        raise


def delete_order(order_id: str) -> bool:
    """Delete an order by ID."""
    url = f"{get_base_url()}/orders?id=eq.{quote(order_id, safe='')}"

    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete order failed: {e}")
        return False


def get_order_companies(order_id: str) -> List[Dict[str, Any]]:
    """Get all companies for an order, sorted by sort_order."""
    url = f"{get_base_url()}/order_companies?order_id=eq.{quote(order_id, safe='')}&order=sort_order.asc"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get order companies failed: {e}")
        return []


def get_order_company(company_id: str) -> Optional[Dict[str, Any]]:
    """Get a single order_company by ID."""
    url = f"{get_base_url()}/order_companies?id=eq.{quote(company_id, safe='')}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get order company failed: {e}")
        return None


def create_order_file(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create an order file metadata row in Supabase."""
    url = f"{get_base_url()}/order_files"

    try:
        response = requests.post(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201]:
            result = response.json() if response.text else {}
            return result[0] if isinstance(result, list) else result
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase create order file failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create order file request failed: {e}")
        raise


def get_order_files(order_id: str, order_company_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get files attached to an order, optionally filtered by order_company."""
    url = f"{get_base_url()}/order_files?order_id=eq.{quote(order_id, safe='')}"
    if order_company_id:
        url += f"&order_company_id=eq.{quote(order_company_id, safe='')}"
    url += "&order=created_at.asc"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get order files failed: {e}")
        return []


def update_order_company(company_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a single order_company record and return the updated row."""
    if not data:
        return get_order_company(company_id)

    url = f"{get_base_url()}/order_companies?id=eq.{quote(company_id, safe='')}"

    try:
        response = requests.patch(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 204]:
            if not response.text:
                return get_order_company(company_id)
            return _single_from_response(response)
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase update order company failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update order company failed: {e}")
        raise


def get_order_invoice(order_id: str) -> Optional[Dict[str, Any]]:
    """Get the invoice for an order, if one exists."""
    url = f"{get_base_url()}/invoices?order_id=eq.{quote(order_id, safe='')}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return results[0] if results else None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get order invoice failed: {e}")
        return None


def create_invoice(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Create a new invoice in Supabase."""
    url = f"{get_base_url()}/invoices"
    try:
        response = requests.post(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201]:
            result = response.json() if response.text else {}
            return result[0] if isinstance(result, list) else result
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase create invoice failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create invoice request failed: {e}")
        raise


def get_invoice(invoice_id: str) -> Optional[Dict[str, Any]]:
    """Get a single invoice by id."""
    url = f"{get_base_url()}/invoices?id=eq.{quote(invoice_id, safe='')}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get invoice failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Supabase Storage Operations
# ---------------------------------------------------------------------------

def get_storage_base_url() -> str:
    """Get Supabase Storage base URL."""
    return f"{os.getenv('SUPABASE_URL')}/storage/v1"


def upload_to_storage(bucket: str, path: str, file_bytes: bytes, content_type: str = "application/octet-stream") -> bool:
    """Upload a file to Supabase Storage."""
    url = f"{get_storage_base_url()}/object/{bucket}/{path}"
    headers = {
        "apikey": os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY", ""),
        "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY', '')}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    try:
        response = requests.post(url, headers=headers, data=file_bytes, timeout=60)
        if response.status_code in [200, 201]:
            return True
        logger.error(f"[Storage] Upload failed ({response.status_code}): {response.text[:200]}")
        return False
    except requests.exceptions.RequestException as e:
        logger.error(f"[Storage] Upload request failed: {e}")
        return False


def download_from_storage(bucket: str, path: str) -> Optional[bytes]:
    """Download a file from Supabase Storage."""
    url = f"{get_storage_base_url()}/object/{bucket}/{path}"
    headers = {
        "apikey": os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY", ""),
        "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY', '')}",
    }
    try:
        response = requests.get(url, headers=headers, timeout=60)
        if response.status_code == 200:
            return response.content
        logger.error(f"[Storage] Download failed ({response.status_code}): {response.text[:200]}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Storage] Download request failed: {e}")
        return None


def create_signed_url(bucket: str, path: str, expires_in: int = 3600) -> Optional[str]:
    """Create a signed URL for a file in Supabase Storage."""
    url = f"{get_storage_base_url()}/object/sign/{bucket}/{path}"
    headers = {
        "apikey": os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY", ""),
        "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY', '')}",
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(url, headers=headers, json={"expiresIn": expires_in}, timeout=30)
        if response.status_code in [200, 201]:
            data = response.json()
            signed_url = data.get("signedUrl")
            if signed_url:
                # Supabase returns relative path, prepend the base URL
                if signed_url.startswith("/"):
                    return f"{os.getenv('SUPABASE_URL')}{signed_url}"
                return signed_url
        logger.error(f"[Storage] Signed URL failed ({response.status_code}): {response.text[:200]}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"[Storage] Signed URL request failed: {e}")
        return None


def ensure_storage_bucket(bucket: str) -> bool:
    """Create a storage bucket if it doesn't exist."""
    url = f"{get_storage_base_url()}/bucket"
    headers = {
        "apikey": os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY", ""),
        "Authorization": f"Bearer {os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY', '')}",
        "Content-Type": "application/json",
    }
    try:
        # List existing buckets
        list_url = f"{get_storage_base_url()}/bucket"
        resp = requests.get(list_url, headers=headers, timeout=15)
        if resp.status_code == 200:
            buckets = resp.json()
            for b in buckets:
                if b.get("name") == bucket:
                    return True  # Bucket already exists

        # Create bucket
        payload = {
            "id": bucket,
            "name": bucket,
            "public": False,
            "file_size_limit": 104857600,  # 100MB
            "allowed_mime_types": None,
        }
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if response.status_code in [200, 201]:
            return True
        logger.warning(f"[Storage] Bucket create returned {response.status_code}: {response.text[:200]}")
        # May already exist (409 conflict) — treat as success
        return response.status_code == 409
    except requests.exceptions.RequestException as e:
        logger.error(f"[Storage] Bucket creation failed: {e}")
        return False


def get_all_invoices(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Get invoices with optional status and client filters."""
    filters = filters or {}
    url = f"{get_base_url()}/invoices?order=created_at.desc.nullslast"
    for key in ("status", "client_id", "order_id"):
        value = filters.get(key)
        if value:
            url += f"&{key}=eq.{quote(str(value), safe='')}"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all invoices failed: {e}")
        return []


def update_invoice(invoice_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing invoice."""
    if not data:
        return get_invoice(invoice_id)
    url = f"{get_base_url()}/invoices?id=eq.{quote(invoice_id, safe='')}"
    try:
        response = requests.patch(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 204]:
            if not response.text:
                updated = get_invoice(invoice_id) or {}
                updated.update(data)
                return updated
            result = response.json()
            return result[0] if isinstance(result, list) else result
        try:
            err_json = response.json()
            message = err_json.get("message", response.text[:200])
        except Exception:
            message = response.text[:200]
        raise Exception(f"Supabase update invoice failed ({response.status_code}): {message}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update invoice request failed: {e}")
        raise


def get_analyst_workload() -> List[Dict[str, Any]]:
    """
    Aggregate query: count pending/in_progress orders per analyst.
    Returns rows like: [{ "auto_assigned_analyst": "email", "count": 3 }]
    """
    url = (
        f"{get_base_url()}/orders"
        f"?select=auto_assigned_analyst,count:id.count"
        f"&status=in.(pending,in_progress)"
        f"&auto_assigned_analyst=not.is.null"
        f"&order=auto_assigned_analyst"
        f"&group=auto_assigned_analyst"
    )

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return results
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get analyst workload failed: {e}")
        return []


def get_active_order_assignments() -> List[Dict[str, Any]]:
    """Get active order analyst assignments ordered by creation time."""
    url = (
        f"{get_base_url()}/orders"
        f"?select=auto_assigned_analyst,created_at"
        f"&status=in.(pending,in_progress)"
        f"&auto_assigned_analyst=not.is.null"
        f"&order=created_at.asc.nullslast"
    )

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get active order assignments failed: {e}")
        return []


def get_max_invoice_number(year: Optional[int] = None) -> int:
    """Get the maximum sequential invoice number for a given year."""
    year = year or datetime.now(timezone.utc).year
    prefix = f"INV-{year}-"
    url = f"{get_base_url()}/invoices?invoice_number=like.{prefix}%&select=invoice_number&limit=1&order=invoice_number.desc.nullslast"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        if results:
            invoice_number = results[0].get("invoice_number", "")
            parts = invoice_number.split("-")
            if len(parts) == 3:
                try:
                    return int(parts[2])
                except ValueError:
                    return 0
        return 0
    except (requests.exceptions.RequestException, ValueError, IndexError) as e:
        logger.error(f"[Supabase] Get max invoice number failed: {e}")
        return 0



def get_max_order_number(year: int) -> Optional[int]:
    """Get the maximum sequential number for orders in a given year.
    Order numbers follow format: ORD-{YYYY}-{NNNN}.
    Returns the max NNNN or 0 if none exist."""
    prefix = f"ORD-{year}-"
    url = f"{get_base_url()}/orders?order_number=like.{prefix}%&select=order_number&limit=1&order=order_number.desc"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        if results:
            order_number = results[0].get("order_number", "")
            parts = order_number.split("-")
            if len(parts) == 3:
                return int(parts[2])
        return 0
    except (requests.exceptions.RequestException, ValueError, IndexError) as e:
        logger.error(f"[Supabase] Get max order number failed: {e}")
        return 0


# ---------------------------------------------------------------------------
# Order Company (flattened) Operations - for Orderds page
# ---------------------------------------------------------------------------


def get_all_order_companies(
    status: Optional[str] = None,
    country: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get all order companies flattened with order and client info.
    Each row represents one report (order_company) with joined order/client data.
    """
    # Select with joins to get order and client data
    select = "*,order:orders!inner(*),client:clients!inner(client_name,valyze_id,email)"
    query_parts = [f"select={quote(select, safe='(),*')}"]
    
    # Apply status filter on order company
    if status:
        query_parts.append(f"status=eq.{quote(status, safe='')}")
    
    # Apply country filter on order company
    if country:
        query_parts.append(f"country=eq.{quote(country, safe='')}")
    
    # Apply search filter
    if search:
        search_term = search.strip()
        if search_term:
            encoded = quote(search_term, safe="")
            query_parts.append(f"or=(company_name.ilike.%{encoded}%,registration_no.ilike.%{encoded}%)")
    
    query_parts.append("order=created_at.desc.nullslast")
    
    full_url = f"{get_base_url()}/order_companies?{'&'.join(query_parts)}"
    
    try:
        response = requests.get(full_url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        
        # Flatten the data - merge order/client into each company record
        flattened = []
        for row in results:
            order_data = row.get('order', {})
            client_data = row.get('client', {})
            
            flattened.append({
                'id': row.get('id'),
                'order_id': row.get('order_id'),
                'order_number': order_data.get('order_number'),
                'client_name': client_data.get('client_name') or order_data.get('client_name'),
                'client_id': order_data.get('client_id'),
                'company_name': row.get('company_name'),
                'country': row.get('country'),
                'registration_no': row.get('registration_no'),
                'report_id': row.get('report_id'),
                'status': row.get('status'),
                'analyst_assigned': row.get('analyst_assigned'),
                'date_received': order_data.get('date_received'),
                'due_date': order_data.get('due_date'),
                'service_level': order_data.get('service_level'),
                'report_type': order_data.get('report_type'),
                'created_at': row.get('created_at'),
                'updated_at': row.get('updated_at'),
                'files': [],
            })
        
        return flattened
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all order companies failed: {e}")
        return []


# ---------------------------------------------------------------------------
# App Users (persisted authentication accounts)
# ---------------------------------------------------------------------------


def get_all_app_users() -> List[Dict[str, Any]]:
    """Return all persisted user accounts."""
    url = f"{get_base_url()}/app_users?select=*&order=created_at.asc.nullslast"
    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get app_users failed: {e}")
        return []


def insert_app_user(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Insert a single user row. Returns the created row or None."""
    url = f"{get_base_url()}/app_users"
    try:
        response = requests.post(url, json=user, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Insert app_user failed: {e}")
        return None


def bulk_insert_app_users(users: List[Dict[str, Any]]) -> bool:
    """Seed multiple user rows at once (used for first-run bootstrap)."""
    if not users:
        return True
    url = f"{get_base_url()}/app_users"
    headers = {**get_headers(), "Prefer": "resolution=ignore-duplicates,return=minimal"}
    try:
        response = requests.post(url, json=users, headers=headers, timeout=30)
        return response.status_code < 400
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Bulk insert app_users failed: {e}")
        return False


def update_app_user(user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Patch a user row by id."""
    url = f"{get_base_url()}/app_users?id=eq.{quote(user_id, safe='')}"
    try:
        response = requests.patch(url, json=updates, headers=get_headers(), timeout=30)
        return _single_from_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update app_user failed: {e}")
        return None


def delete_app_user(user_id: str) -> bool:
    """Delete a user row by id."""
    url = f"{get_base_url()}/app_users?id=eq.{quote(user_id, safe='')}"
    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code < 400
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete app_user failed: {e}")
        return False
