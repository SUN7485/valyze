#!/bin/bash
# Start backend (http://localhost:8000) and frontend (http://localhost:1573). Ctrl+C stops both.
cd "$(dirname "${BASH_SOURCE[0]}")"

(cd backend && PYTHONIOENCODING=utf-8 python3 -m uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!
(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait; exit 0' SIGINT SIGTERM
echo "Backend:  http://localhost:8000  (API docs at /docs)"
echo "Frontend: http://localhost:1573"
echo "Client portal: http://localhost:1573/portal?token=<link token>"
wait
