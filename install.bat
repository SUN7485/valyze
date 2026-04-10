@echo off
title Valyze Credit report - Full Installation
color 0A
echo.
echo ============================================
echo VALYZE CREDIT REPORT - INSTALLER
echo   This will set up everything from scratch
echo ============================================
echo.

:: Check Python 3.12 specifically
echo [1/8] Checking Python 3.12...
py -3.12 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python 3.12 not found!
    echo.
    echo Please install Python 3.12 from:
    echo https://www.python.org/downloads/release/python-3129/
    echo.
    echo IMPORTANT: During installation, check:
    echo   [x] Add Python to PATH
    echo   [x] Install for all users
    echo.
    echo If you have Python 3.14 installed, you may need to:
    echo 1. Uninstall Python 3.14, OR
    echo 2. Make sure Python 3.12 is in your PATH
    pause
    exit /b 1
)
py -3.12 --version
echo       Python 3.12 OK
echo.

:: Check Node
echo [2/8] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found!
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo       Node.js OK
echo.

:: Install Backend Dependencies
echo [3/8] Installing Python packages...
cd /d "%~dp0backend"
py -3.12 -m pip install --upgrade pip
py -3.12 -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Python package installation failed!
    pause
    exit /b 1
)
echo       Python packages OK
echo.

:: Install Playwright Chromium
echo [4/8] Installing Playwright Chromium browser...
py -3.12 -m playwright install chromium
if %errorlevel% neq 0 (
    echo WARNING: Playwright Chromium install failed
    echo PDF generation may not work
    echo You can retry later: py -3.12 -m playwright install chromium
)
echo       Playwright OK
echo.

:: Install Valyze Extractor Dependencies
echo [5/8] Installing Valyze Extractor Node packages...
cd /d "%~dp0valyze-extractor"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed for Extractor!
    pause
    exit /b 1
)
echo       Valyze Extractor OK
echo.

:: Install Frontend Dependencies
echo [6/8] Installing Frontend Node packages...
cd /d "%~dp0frontend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)
echo       Node packages OK
echo.

:: Create required directories
echo [7/8] Creating directories...
cd /d "%~dp0backend"
if not exist "uploads" mkdir uploads
if not exist "outputs" mkdir outputs
if not exist "chroma_db" mkdir chroma_db
echo       Directories OK
echo.

:: Verify installation
echo [8/8] Verifying installation...
cd /d "%~dp0backend"
py -3.12 -c "import fastapi; print('  FastAPI OK')"
py -3.12 -c "import pydantic; print('  Pydantic OK')"
py -3.12 -c "import pystache; print('  pystache OK')"
py -3.12 -c "import httpx; print('  httpx OK')"
py -3.12 -c "from rank_bm25 import BM25Okapi; print('  BM25 OK')"
py -3.12 -c "from PIL import Image; print('  Pillow OK')"
py -3.12 -c "import cv2; print('  OpenCV OK')"
py -3.12 -c "from pypdf import PdfReader; print('  pypdf OK')"
py -3.12 -c "import pdfplumber; print('  pdfplumber OK')"
py -3.12 -c "from playwright.sync_api import sync_playwright; print('  Playwright OK')"
echo.

:: Check Tesseract (optional)
echo [OPTIONAL] Checking Tesseract OCR...
where tesseract >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Tesseract OCR not found.
    echo OCR for scanned documents will NOT work.
    echo Download from: https://github.com/UB-Mannheim/tesseract/wiki
    echo Install to: C:\Program Files\Tesseract-OCR\
) else (
    echo       Tesseract OK
)
echo.

echo ============================================
echo   INSTALLATION COMPLETE!
echo ============================================
echo.
echo   Next steps:
echo   1. Start LM Studio and load Qwen2.5 7B
echo      (optional - system works without it)
echo   2. Double-click startall.bat
echo   3. Open http://localhost:1573
echo.
pause