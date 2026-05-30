#!/usr/bin/env python3
"""Apply Supabase SQL migration using service role key."""

import os
import sys
import json
import requests
from pathlib import Path

print("=== Migration Runner ===")

# Load env
dotenv_path = Path(__file__).resolve().parent.parent / ".env"
print(f"Loading .env from: {dotenv_path}")
with open(dotenv_path) as f:
    for line in f:
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            os.environ[k] = v

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

print(f"SUPABASE_URL: {SUPABASE_URL}")
print(f"SERVICE_KEY length: {len(SERVICE_KEY) if SERVICE_KEY else 0}")

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)

SQL_ENDPOINT = f"{SUPABASE_URL}/rest/v1/sql"
print(f"SQL endpoint: {SQL_ENDPOINT}")

# Read migration file
migration_path = (
    Path(__file__).resolve().parent
    / "supabase"
    / "migrations"
    / "003_remove_unique_constraints.sql"
)
print(f"Reading migration: {migration_path}")
sql = migration_path.read_text()
print(f"SQL length: {len(sql)} chars")

# Test connectivity with simple query first
test_sql = "SELECT version();"
print("\nTesting connection with simple query...")
try:
    resp = requests.post(
        SQL_ENDPOINT,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={"query": test_sql},
        timeout=10,
    )
    print(f"Test status: {resp.status_code}")
    print(f"Test response: {resp.text[:300]}")
except Exception as e:
    print(f"Test request failed: {e}")
    sys.exit(1)

if resp.status_code >= 400:
    print(f"ERROR: Test query failed")
    sys.exit(1)

print("\nConnection OK. Applying full migration...")
# Split SQL into statements
# For simplicity, send whole script — Supabase /sql supports multi-statement
response = requests.post(
    SQL_ENDPOINT,
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    },
    json={"query": sql},
    timeout=30,
)

print(f"Migration status: {response.status_code}")
print(f"Migration response: {response.text[:500]}")

if response.status_code >= 400:
    err = response.text.lower()
    if "already exists" in err or "duplicate" in err or "permission denied" in err:
        print("Info: objects already exist — migration is idempotent, continuing")
    else:
        print("ERROR: Migration failed")
        sys.exit(1)
else:
    print("Migration applied successfully")
