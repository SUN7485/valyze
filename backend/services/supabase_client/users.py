"""app_users table (staff accounts; see api/auth.py)."""

import logging
import requests
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from ._core import _handle_response, _single_from_response, get_base_url, get_headers

logger = logging.getLogger(__name__)


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
