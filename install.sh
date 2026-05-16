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
echo "[2/6] Installing Python dependencies..."
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
echo "[4/6] Installing Valyze Extractor dependencies..."
cd valyze-extractor
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
echo "[7/7] Setting up environment configuration..."
if [ ! -f "backend/.env" ]; then
    echo "WARNING: No .env file found!"
    echo ""
    echo "Please create a .env file in the backend folder with:"
    echo "  SUPABASE_URL=your-supabase-url"
    echo "  SUPABASE_SERVICE_KEY=your-service-key"
    echo "  JWT_SECRET_KEY=your-secret-key-min-32-chars"
    echo ""
    echo "See .env.example for template."
    echo ""
    read -p "Press Enter to continue..."
else
    echo "  .env file found"
fi

echo ""
echo "============================================"
echo "  INSTALLATION COMPLETE!"
echo "============================================"
echo ""
echo "Run './startall.sh' to start the system"
echo ""
echo "If you get permission errors, run:"
echo "  chmod +x startall.sh startbackend.sh install.sh"