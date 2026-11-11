"""Shared test setup: make backend/ importable and give the app dummy Supabase config.

No test talks to a real database. Anything that would reach Supabase is
monkeypatched in the test that needs it.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")
