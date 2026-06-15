#!/bin/bash

clear
echo "============================================"
echo "VALYZE CREDIT REPORT - STARTING ALL SERVICES"
echo "============================================"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create required directories
mkdir -p "$SCRIPT_DIR/backend/uploads"
mkdir -p "$SCRIPT_DIR/backend/outputs"

# Start Backend
echo "[1/3] Starting Backend (port 8000)..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Wait for backend to start
echo "   Waiting for backend to initialize..."
sleep 5

# Start Frontend
echo "[2/3] Starting Frontend (port 1573)..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 3

# Start Valyze Client Portal
echo "[3/3] Starting Valyze Client Portal (port 3000)..."
cd "$SCRIPT_DIR/valyze-portal"
npm run dev &
PORTAL_PID=$!

sleep 3

echo ""
echo "============================================"
echo "  SYSTEM STARTED SUCCESSFULLY!"
echo "============================================"
echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:1573"
echo "  Client Portal: http://localhost:3000"
echo ""
echo "  Process IDs:"
echo "    Backend: $BACKEND_PID"
echo "    Frontend: $FRONTEND_PID"
echo "    Portal: $PORTAL_PID"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

# Function to kill all processes on exit
cleanup() {
    echo ""
    echo "Stopping all services..."
    kill $BACKEND_PID $FRONTEND_PID $PORTAL_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID $PORTAL_PID 2>/dev/null
    echo "All services stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for user to press Ctrl+C
while true; do
    sleep 1
done