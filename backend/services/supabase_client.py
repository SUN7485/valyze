"""
Supabase client service for Valyze Credit Reports.

Provides:
- Database connection through Supabase
- Report storage and retrieval
- Search functionality by: Client Name, Report ID, Client Reference, Company Name, Country, Address, CR No., Analyst
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client, Client

_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
    """Get or create Supabase client with service role key for admin operations."""
    global _supabase_client

    if _supabase_client is None:
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv(
            "SUPABASE_ANON_KEY"
        )

        if not supabase_url or not supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")

        _supabase_client = create_client(supabase_url, supabase_key)

    return _supabase_client


def init_supabase():
    """Initialize Supabase connection."""
    return get_supabase()


# ---------------------------------------------------------------------------
# Report Operations
# ---------------------------------------------------------------------------


def create_report(report_id: str, report_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new report in Supabase."""
    client = get_supabase()

    data = {
        "id": report_id,
        "status": report_data.get("status", "uploading"),
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

    response = client.table("reports").insert(data).execute()
    return response.data[0] if response.data else {}


def get_report(report_id: str) -> Optional[Dict[str, Any]]:
    """Get a report by ID."""
    client = get_supabase()

    response = client.table("reports").select("*").eq("id", report_id).execute()

    if response.data and len(response.data) > 0:
        return response.data[0]
    return None


def update_report(report_id: str, report_data: Dict[str, Any]) -> Dict[str, Any]:
    """Update an existing report."""
    client = get_supabase()

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

    response = client.table("reports").update(data).eq("id", report_id).execute()
    return response.data[0] if response.data else {}


def delete_report(report_id: str) -> bool:
    """Delete a report."""
    client = get_supabase()

    response = client.table("reports").delete().eq("id", report_id).execute()
    return len(response.data) > 0 if response.data else False


def search_reports(
    query: str = "",
    company_name: Optional[str] = None,
    cr_number: Optional[str] = None,
    country: Optional[str] = None,
    client_reference: Optional[str] = None,
    analyst: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Search reports by various fields.

    Searchable fields:
    - client_name (searches company_name and legal_name)
    - report_id
    - client_reference
    - company_name
    - country
    - address
    - cr_number
    - analyst
    """
    client = get_supabase()

    # Build the query using OR filters with array syntax
    if query:
        # Search across multiple fields using OR
        or_filters = [
            f"id.ilike.%{query}%",
            f"company_name.ilike.%{query}%",
            f"legal_name.ilike.%{query}%",
            f"client_reference.ilike.%{query}%",
            f"cr_number.ilike.%{query}%",
            f"country.ilike.%{query}%",
            f"address.ilike.%{query}%",
            f"analyst.ilike.%{query}%",
        ]
        response = (
            client.table("reports").select("*").or_(or_filters).limit(limit).execute()
        )
    else:
        # Build query with filters
        query_builder = client.table("reports").select("*")

        if company_name:
            query_builder = query_builder.ilike("company_name", f"%{company_name}%")
        if cr_number:
            query_builder = query_builder.ilike("cr_number", f"%{cr_number}%")
        if country:
            query_builder = query_builder.ilike("country", f"%{country}%")
        if client_reference:
            query_builder = query_builder.ilike(
                "client_reference", f"%{client_reference}%"
            )
        if analyst:
            query_builder = query_builder.ilike("analyst", f"%{analyst}%")

        response = query_builder.limit(limit).execute()

    return response.data if response.data else []


def get_all_reports(limit: int = 100) -> List[Dict[str, Any]]:
    """Get all reports."""
    client = get_supabase()

    response = (
        client.table("reports")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data if response.data else []


def get_reports_count() -> int:
    """Get total reports count."""
    client = get_supabase()

    response = client.table("reports").select("id", count="exact").execute()
    return response.count if response.count else 0
