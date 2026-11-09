"""Shared pytest setup for the backend tests (no network)."""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Deterministic, non-production config before any api.* module is imported.
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-0123456789")
os.environ.pop("VERCEL", None)
if os.environ.get("ENV", "").lower() == "production":
    os.environ["ENV"] = "test"
os.environ.setdefault("SUPABASE_URL", "http://supabase.invalid")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
