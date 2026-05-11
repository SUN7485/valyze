#!/bin/bash

echo "============================================"
echo "VALYZE CREDIT REPORT - STOPPING ALL SERVICES"
echo "============================================"
echo ""

# Kill Python processes (backend)
echo "Stopping Backend (port 8000)..."
pkill -f "uvicorn main:app" 2>/dev/null
echo "Backend stopped."

# Kill Node processes (frontend and extractor)
echo "Stopping Frontend (port 1573) and Extractor (port 5174)..."
pkill -f "npm run dev" 2>/dev/null
echo "Frontend and Extractor stopped."

echo ""
echo "============================================"
echo "  ALL SERVICES STOPPED"
echo "============================================"
echo ""