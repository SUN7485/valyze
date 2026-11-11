"""orders, order_companies and order_files tables."""

import logging
import requests
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from ._core import _handle_response, _single_from_response, get_base_url, get_headers

logger = logging.getLogger(__name__)


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
    if analyst == "unassigned":
        query.append("auto_assigned_analyst=is.null")
    elif analyst:
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


def delete_order_company(company_id: str) -> bool:
    """Delete a single order_company (one focused report) by ID."""
    url = f"{get_base_url()}/order_companies?id=eq.{quote(company_id, safe='')}"

    try:
        response = requests.delete(url, headers=get_headers(), timeout=30)
        return response.status_code in [200, 204]
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Delete order company failed: {e}")
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


def get_all_order_companies(
    status: Optional[str] = None,
    country: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get all order companies flattened with order and client info.
    Each row represents one report (order_company) with joined order/client data.
    """
    # Select with joins to get order and client data. `order_companies` has no
    # FK to `clients` (client lives on `orders`), so the client must be embedded
    # through the order — embedding it directly here 400s and drops every row.
    select = "*,order:orders!inner(*,client:clients(client_name,valyze_id,email))"
    query_parts = [f"select={quote(select, safe='(),*')}"]
    
    # Apply status filter on order company
    if status:
        query_parts.append(f"status=eq.{quote(status, safe='')}")
    
    # Apply country filter on order company
    if country:
        query_parts.append(f"country=eq.{quote(country, safe='')}")

    # NOTE: the `search` param is applied in Python below (not at the DB level)
    # so it can span embedded columns too (order_number, client_ref, client name).

    query_parts.append("order=created_at.desc.nullslast")

    full_url = f"{get_base_url()}/order_companies?{'&'.join(query_parts)}"

    try:
        response = requests.get(full_url, headers=get_headers(), timeout=30)
        results = _handle_response(response)

        # Flatten the data - merge order/client into each company record
        flattened = []
        for row in results:
            order_data = row.get('order') or {}
            client_data = order_data.get('client') if isinstance(order_data.get('client'), dict) else {}
            client_data = client_data or {}

            # Per-company client_ref (3.3) falling back to the order-level ref.
            company_client_ref = row.get('client_ref')
            order_client_ref = order_data.get('client_ref')

            flattened.append({
                'id': row.get('id'),
                'order_id': row.get('order_id'),
                'order_number': order_data.get('order_number'),
                'client_name': client_data.get('client_name') or order_data.get('client_name'),
                'client_id': order_data.get('client_id'),
                'client_ref': company_client_ref or order_client_ref,
                'order_client_ref': order_client_ref,
                'company_name': row.get('company_name'),
                'country': row.get('country'),
                'registration_no': row.get('registration_no'),
                'report_id': row.get('report_id'),
                'status': row.get('status'),
                'analyst_assigned': row.get('analyst_assigned'),
                'auto_assigned_analyst': order_data.get('auto_assigned_analyst'),
                'date_received': order_data.get('date_received'),
                'due_date': order_data.get('due_date'),
                'service_level': order_data.get('service_level'),
                'speed': order_data.get('speed'),
                'report_type': order_data.get('report_type'),
                'report_types': order_data.get('report_types'),
                'created_at': row.get('created_at'),
                'updated_at': row.get('updated_at'),
                'files': [],
            })

        # Case-insensitive search across every meaningful field (Python-side so
        # it can cover the embedded order/client columns as well).
        if search and search.strip():
            needle = search.strip().lower()
            flattened = [
                r for r in flattened
                if any(
                    needle in str(r.get(field) or '').lower()
                    for field in (
                        'company_name', 'registration_no', 'report_id',
                        'order_number', 'client_ref', 'order_client_ref', 'client_name',
                    )
                )
            ]

        return flattened
    except requests.exceptions.RequestException as e:
        logger.error(f"[Supabase] Get all order companies failed: {e}")
        return []
