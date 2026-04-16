"""
Supabase client service for Valyze Credit Reports.
Uses direct HTTP calls to avoid complex dependency issues.
"""

import os
import logging
import requests
from pathlib import Path
from typing import Any, Dict, List, Optional

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
    url = f"{get_base_url()}/reports"

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

    try:
        response = requests.post(url, json=data, headers=get_headers(), timeout=30)
        if response.status_code in [200, 201]:
            return response.json() if response.text else {}
        logger.error(
            f"[Supabase] Create failed: {response.status_code} - {response.text[:200]}"
        )
        return {}
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Create request failed: {e}")
        return {}


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


def update_report(report_id: str, report_data: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing report."""
    url = f"{get_base_url()}/reports?id=eq.{report_id}"

    data = {
        "status": report_data.get("status"),
        "report_json": report_data,
        "company_name": report_data.get("fields", {})
        .get("company_name", {})
        .get("value"),
        "legal_name": report_data.get("fields", {}).get("legal_name", {}).get("value"),
        "cr_number": report_data.get("fields", {}).get("cr_number", {}).get("value"),
        "client_reference": report_data.get("fields", {})
        .get("client_reference", {})
        .get("value"),
        "country": report_data.get("fields", {}).get("country", {}).get("value"),
        "address": report_data.get("fields", {}).get("address", {}).get("value"),
        "analyst": report_data.get("fields", {}).get("analyst", {}).get("value"),
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


def search_reports(
    query: str = "",
    company_name: Optional[str] = None,
    cr_number: Optional[str] = None,
    country: Optional[str] = None,
    client_reference: Optional[str] = None,
    analyst: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Search reports by various fields."""
    filters = []

    if query:
        or_filters = [
            f"id.ilike.**{query}**",
            f"company_name.ilike.**{query}**",
            f"legal_name.ilike.**{query}**",
            f"client_reference.ilike.**{query}**",
            f"cr_number.ilike.**{query}**",
            f"country.ilike.**{query}**",
            f"address.ilike.**{query}**",
            f"analyst.ilike.**{query}**",
        ]
        url = f"{get_base_url()}/reports?or=({','.join(or_filters)})&limit={limit}"
    else:
        url = f"{get_base_url()}/reports"
        if company_name:
            filters.append(f"company_name.ilike.**{company_name}**")
        if cr_number:
            filters.append(f"cr_number.ilike.**{cr_number}**")
        if country:
            filters.append(f"country.ilike.**{country}**")
        if client_reference:
            filters.append(f"client_reference.ilike.**{client_reference}**")
        if analyst:
            filters.append(f"analyst.ilike.**{analyst}**")

        if filters:
            url += f"?{'&'.join(filters)}&"
        else:
            url += "?"
        url += f"limit={limit}"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Search failed: {e}")
        return []


def get_all_reports(limit: int = 500, offset: int = 0) -> List[Dict[str, Any]]:
    """Get all reports with pagination support."""
    url = (
        f"{get_base_url()}/reports?order=created_at.desc&limit={limit}&offset={offset}"
    )

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        return _handle_response(response)
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all reports failed: {e}")
        return []


def get_reports_count() -> int:
    """Get total reports count."""
    url = f"{get_base_url()}/reports?select=id&count=exact"

    try:
        response = requests.get(url, headers=get_headers(), timeout=30)
        if response.headers.get("Content-Range"):
            return int(response.headers.get("Content-Range", "0").split("/")[-1])
        return 0
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get count failed: {e}")
        return 0


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
