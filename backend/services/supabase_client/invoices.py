"""invoices table."""

import logging
import requests
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from ._core import _handle_response, _single_from_response, get_base_url, get_headers

logger = logging.getLogger(__name__)


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
