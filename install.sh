#!/bin/bash

echo "============================================"
echo "VALYZE - INSTALLATION SCRIPT (macOS)"
echo "============================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo ""
echo "[1/6] Installing system dependencies..."
brew install python@3.12 node ghostscript tesseract poppler

echo ""
echo "[2/5] Installing Python dependencies..."
if ! python3 --version > /dev/null 2>&1; then
    echo "ERROR: Python 3 not found."
    exit 1
fi
cd backend
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
cd ..

echo ""
echo "[3/6] Installing Frontend dependencies..."
if ! command -v node > /dev/null 2>&1; then
    echo "ERROR: Node.js not found."
    exit 1
fi
cd frontend
npm install
cd ..

echo ""
echo "[4/6] Installing Valyze Portal dependencies..."
cd valyze-portal
npm install
cd ..

echo ""
echo "[5/6] Installing Playwright browsers..."
cd backend
python3 -m playwright install chromium
cd ..

echo ""
echo "[6/6] Creating required directories..."
mkdir -p backend/uploads
mkdir -p backend/outputs

echo ""
echo "============================================"
echo "  INSTALLATION COMPLETE!"
echo "============================================"
echo ""
echo "Run './startall.sh' to start the system"
echo ""
echo "If you get permission errors, run:"
echo "  chmod +x startall.sh startbackend.sh install.sh"