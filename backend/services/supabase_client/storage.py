"""Supabase Storage (portal file uploads)."""

import logging
import os
import requests
from typing import Optional

logger = logging.getLogger(__name__)


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
            # Supabase returns `signedURL` (capital URL) from /object/sign/... —
            # reading only `signedUrl` made this return None on every 200, so every
            # portal file came back with file_url: null.
            signed_url = data.get("signedURL") or data.get("signedUrl")
            if signed_url:
                # The path is relative to the STORAGE api root ("/object/sign/…"),
                # so it needs /storage/v1 — prepending only SUPABASE_URL 404s.
                if signed_url.startswith("/storage/"):
                    return f"{os.getenv('SUPABASE_URL')}{signed_url}"
                if signed_url.startswith("/"):
                    return f"{get_storage_base_url()}{signed_url}"
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
        # Probe the bucket by name instead of listing every bucket. Listing needs
        # storage-admin rights, and a key without them gets `200 []` rather than a
        # 403 — indistinguishable from "the project has no buckets". That false
        # negative sent this function on to create a bucket that might already
        # exist, and hid the real problem (wrong key) behind a generic failure.
        # The by-name probe answers definitively: 200, or a "Bucket not found" body.
        probe = requests.get(f"{get_storage_base_url()}/bucket/{bucket}", headers=headers, timeout=15)
        if probe.status_code == 200:
            return True

        # Create bucket.
        # Deliberately no `file_size_limit`: a bucket limit above the project's
        # global upload ceiling makes Supabase reject the create with
        # 400 {"statusCode":"413","error":"Payload too large"} — the bucket then
        # never exists and every upload 404s "Bucket not found". Omitting the
        # field inherits the project ceiling, so this can't drift out of sync.
        # Per-file size is enforced by the caller anyway.
        payload = {
            "id": bucket,
            "name": bucket,
            "public": False,
        }
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if response.status_code in [200, 201]:
            logger.info(f"[Storage] Created bucket '{bucket}'")
            return True
        # Already exists — Supabase answers 409, or 400 with a "already exists" body.
        if response.status_code == 409 or "already exists" in response.text.lower():
            return True
        # Creating a bucket needs the service_role key. Every table here has RLS
        # `using (true)`, so an anon key reads and writes the DB perfectly well and
        # nothing looks broken until a file upload — call that out by name, because
        # the fix is an env var, not code.
        if response.status_code in (401, 403):
            logger.error(
                f"[Storage] Not permitted to create bucket '{bucket}' ({response.status_code}). "
                "SUPABASE_SERVICE_KEY is missing or is not a service_role key — bucket "
                "administration requires service_role. Create the bucket manually in the "
                "Supabase dashboard, or set a real service_role key."
            )
            return False
        logger.error(
            f"[Storage] Bucket '{bucket}' create failed ({response.status_code}): {response.text[:200]}"
        )
        return False
    except requests.exceptions.RequestException as e:
        logger.error(f"[Storage] Bucket creation failed: {e}")
        return False
