"""
Vercel Serverless Entry Point — Valyze Credit Report Backend

This file exposes the FastAPI app as a Vercel serverless function.
All routes are handled by the existing FastAPI app in ../main.py
"""

import sys
import os

# Add the backend directory to Python path so imports work
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from main import app  # noqa: E402

# Vercel expects a handler variable for Python serverless functions
handler = app