# Plan: Supabase Database Migration

## Goal
Migrate from SQLite to Supabase (PostgreSQL) while maintaining all existing functionality.

---

## Current System

### Database Structure
- **SQLite** with SQLAlchemy async (`aiosqlite`)
- Two tables: `reports`, `uploaded_files`
- Report data stored as JSON in `report_json` column

### Key Files
| File | Purpose |
|------|---------|
| `backend/database/db.py` | Engine, tables, session |
| `backend/database/crud.py` | CRUD operations |
| `.env` | DATABASE_URL config |

---

## Implementation Plan

### Phase 1: Supabase Setup

#### 1.1 Create Supabase Project
- Create new Supabase project at supabase.com
- Get connection string from settings

#### 1.2 Update Environment
- **File**: `backend/.env`
- Add: `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname`
- Add: `SUPABASE_URL=https://your-project.supabase.co`
- Add: `SUPABASE_ANON_KEY=your-anon-key`

---

### Phase 2: Database Layer Updates

#### 2.1 Update db.py
- **File**: `backend/database/db.py`
- Change import: `from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker`
- Update engine creation for PostgreSQL
- No schema changes needed (Same table structure works)

```python
# New engine
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:password@localhost:5432/postgres")
engine = create_async_engine(DATABASE_URL, echo=True)
```

#### 2.2 Update requirements.txt
- Add: `asyncpg>=0.29.0`
- Keep: `aiosqlite` (for fallback dev)

---

### Phase 3: Supabase Client (Optional)

#### 3.1 Add Supabase Service
- **File**: `backend/services/supabase_client.py`
- For Supabase-specific features (auth, realtime)

```python
from supabase import create_client, Client

_supabase: Client = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_ANON_KEY")
        )
    return _supabase
```

---

### Phase 4: Testing

#### 4.1 Test Connection
```bash
python -c "import asyncio; from database.db import engine; print(engine.url)"
```

#### 4.2 Run Migrations
- Create tables in Supabase dashboard OR
- Use: `sqlmodel` or alembic

---

## Changes Summary

### Modified Files
- `backend/.env` - DATABASE_URL
- `backend/database/db.py` - Engine config
- `backend/requirements.txt` - asyncpg

### New Files (Optional)
- `backend/services/supabase_client.py` - Supabase client

---

## Connection String Format

```
postgresql+asyncpg://[user]:[password]@[host]:[port]/[database]
```

Example:
```
postgresql+asyncpg://postgres:password123@db.xyz.supabase.co:5432/postgres
```

---

## Verification
1. Check connection to Supabase
2. Create test report via API
3. Verify data persists
4. Test all CRUD operations

---

## Notes
- Schema is compatible (PostgreSQL supports same table structure)
- Minimal code changes needed
- Supabase provides: PostgreSQL database, Auth, Realtime, Edge Functions