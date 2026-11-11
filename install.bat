@echo off
title Valyze - Install
cd /d "%~dp0"

where py >nul 2>&1 || (echo ERROR: Python launcher "py" not found. Install Python 3.12 from python.org. & pause & exit /b 1)
where npm >nul 2>&1 || (echo ERROR: Node.js not found. Install it from nodejs.org. & pause & exit /b 1)

echo [1/3] Backend Python packages...
py -m pip install -r backend\requirements.txt || (echo ERROR: pip install failed & pause & exit /b 1)

echo [2/3] Frontend Node packages...
cd /d "%~dp0frontend"
call npm install || (echo ERROR: npm install failed & pause & exit /b 1)
cd /d "%~dp0"

echo [3/3] Local env files...
if not exist backend\.env copy backend\.env.example backend\.env >nul
if not exist frontend\.env copy frontend\.env.example frontend\.env >nul

echo.
echo Done. Fill in SUPABASE_URL / SUPABASE_SERVICE_KEY in backend\.env, then run startall.bat
pause
