"""
Database setup for Valyze Credit Report Backend.

PRODUCTION: Uses Supabase (PostgreSQL). Local SQLite is deprecated.
This module provides a stub `get_db` dependency that returns None.
All data operations go through Supabase via services.supabase_client.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


# ---------------------------------------------------------------------------
# Stub Base for compatibility (retained for type checkers)
# ---------------------------------------------------------------------------


class Base:
    """Base class retained for import compatibility only — no ORM usage."""

    pass


# ---------------------------------------------------------------------------
# Stub ORM Models (for type hints/imports only)
# ---------------------------------------------------------------------------


class ReportRow(Base):
    """Stub — not used. Kept to satisfy import statements."""

    __tablename__ = "reports"
    id = None
    status = None
    report_json = None
    extraction_stats_json = None
    created_at = None
    updated_at = None


class UploadedFileRow(Base):
    """Stub — not used. Kept to satisfy import statements."""

    __tablename__ = "uploaded_files"
    id = None
    report_id = None
    filename = None
    file_path = None
    file_type = None
    file_size = None
    language = None
    pages = None
    processed = None
    created_at = None


# ---------------------------------------------------------------------------
# Deprecated: SQLAlchemy engine & session removed
# ---------------------------------------------------------------------------

# DATABASE_URL removed — Supabase replaces SQLite


# ---------------------------------------------------------------------------
# Stub Dependency
# ---------------------------------------------------------------------------


async def get_db():
    """FastAPI dependency stub — yields None.

    The application no longer uses direct SQLite sessions.
    All database operations are performed through Supabase.
    This stub maintains signature compatibility during migration.
    """
    yield None


# ---------------------------------------------------------------------------
# Stub init_db
# ---------------------------------------------------------------------------


async def init_db():
    """No-op. Database schema is managed via Supabase migrations."""
    pass
