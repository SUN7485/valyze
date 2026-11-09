"""
Database setup for Valyze Credit Report Backend.

PRODUCTION: Uses Supabase (PostgreSQL). Local SQLite is gone.
Only the no-op init_db() remains (main.py calls it at startup).
All data operations go through Supabase via services.supabase_client.
"""

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


# ---------------------------------------------------------------------------
# Stub init_db
# ---------------------------------------------------------------------------


async def init_db():
    """No-op. Database schema is managed via Supabase migrations."""
    pass
