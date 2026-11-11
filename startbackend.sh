#!/bin/bash
# Start only the backend on http://localhost:8000.
cd "$(dirname "${BASH_SOURCE[0]}")/backend"
PYTHONIOENCODING=utf-8 exec python3 -m uvicorn main:app --reload --port 8000
