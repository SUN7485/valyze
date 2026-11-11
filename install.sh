#!/bin/bash
# Install backend + frontend dependencies for local development (macOS / Linux).
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

command -v python3 >/dev/null || { echo "ERROR: python3 not found (3.12+ recommended)"; exit 1; }
command -v npm >/dev/null     || { echo "ERROR: Node.js/npm not found (Node 22 recommended)"; exit 1; }

echo "[1/3] Backend Python packages..."
python3 -m pip install -r backend/requirements.txt

echo "[2/3] Frontend Node packages..."
(cd frontend && npm install)

echo "[3/3] Local env files..."
[ -f backend/.env ]  || cp backend/.env.example backend/.env
[ -f frontend/.env ] || cp frontend/.env.example frontend/.env

echo
echo "Done. Fill in SUPABASE_URL / SUPABASE_SERVICE_KEY in backend/.env, then run ./startall.sh"
