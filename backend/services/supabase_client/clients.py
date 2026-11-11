"""clients + client_sessions (portal links) tables."""

import logging
import re
import requests
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from ._core import _handle_response, _single_from_response, get_base_url, get_headers

logger = logging.getLogger(__name__)


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
