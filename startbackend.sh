#!/bin/bash

clear
echo "============================================"
echo "VALYZE BACKEND - STARTING"
echo "============================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create required directories
mkdir -p "$SCRIPT_DIR/backend/uploads"
mkdir -p "$SCRIPT_DIR/backend/outputs"

echo "Starting Backend (port 8000)..."
echo "Backend logs will appear below..."
echo "============================================"
echo ""

cd "$SCRIPT_DIR/backend"
export PYTHONIOENCODING=utf-8
python3 -m uvicorn main:app --reload --port 8000