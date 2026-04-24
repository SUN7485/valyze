"""
Supabase client service for Valyze Credit Reports.
Uses direct HTTP calls to avoid complex dependency issues.
"""

import json
import os
import logging
import requests
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

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
        logger.error(
            f"[Supabase] Create failed: {response.status_code} - {response.text[:200]}"
        )
        print(
            f"[Supabase] Create report error: {response.status_code} - {response.text[:500]}"
        )
        raise Exception(f"Supabase Error {response.status_code}: {response.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create request failed: {e}")
        print(f"[Supabase] Create request exception: {e}")
        import traceback

        traceback.print_exc()
        raise Exception(f"Request failed: {e}")


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


def get_all_reports() -> List[Dict[str, Any]]:
    """Get all reports."""
    url = f"{get_base_url()}/reports"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all reports failed: {e}")
        return []


def get_reports_count() -> int:
    """Get the count of reports."""
    url = f"{get_base_url()}/reports?select=id"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        results = _handle_response(response)
        return len(results)
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
        "analyst": get_field_value("analyst"),
    }

    try:
        response = requests.patch(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 204]:
            return report_data
        logger.error(
            f"[Supabase] Update failed: {response.status_code} - {response.text[:200]}"
        )
        return {}
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Update request failed: {e}")
        return {}


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
