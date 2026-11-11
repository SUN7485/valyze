"""Shared PostgREST plumbing: auth headers, base URL, response parsing."""

import base64
import json
import logging
import os
import requests
from typing import Any, Dict, List, Optional
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger(__name__)


def warn_if_key_is_public() -> Optional[str]:
    """Flag a browser-safe key sitting in the server's privileged key slot.

    A publishable/anon key still drives most of this app correctly, because every
    app table carries RLS `using (true)` — so the misconfiguration stays invisible
    until someone uploads a file and hits Storage, which does enforce RLS. Log it
    at import so it surfaces in the deploy, not in a client's failed order.
    """
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    problem = None
    if key.startswith("sb_publishable_"):
        problem = "a new-style PUBLISHABLE (public) key"
    elif key.startswith("eyJ"):
        try:
            payload = key.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            if json.loads(base64.urlsafe_b64decode(payload)).get("role") == "anon":
                problem = "a legacy ANON key"
        except Exception:
            pass
    if problem:
        problem = (
            f"[Supabase] SUPABASE_SERVICE_KEY holds {problem}. Storage uploads and "
            "bucket administration require the secret/service_role key — expect portal "
            "file submissions to fail. Fix: Supabase → Project Settings → API Keys → "
            "Secret keys (sb_secret_…)."
        )
        logger.error(problem)
    return problem


warn_if_key_is_public()


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
