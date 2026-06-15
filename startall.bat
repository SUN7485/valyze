@echo off
title Valyze Credit Report - Complete System
color 0B
echo.
echo ============================================
echo VALYZE CREDIT REPORT - STARTING ALL SERVICES
echo ============================================
echo.

:: Create required directories
cd /d "%~dp0backend"
if not exist "uploads" mkdir uploads
if not exist "outputs" mkdir outputs

:: Start Backend in THIS window
echo [1/4] Starting Backend (port 8000)...
echo    Backend logs will appear below...
echo ============================================
echo.

cd /d "%~dp0backend"
start /B py -m uvicorn main:app --reload --port 8000

:: Wait for backend to start
echo    Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

:: Start Frontend in THIS window too (using start /B to run in background)
echo [2/3] Starting Frontend (port 1573)...
echo    Frontend starting in background...
cd /d "%~dp0frontend"
start /B npm run dev

:: Start Valyze Client Portal in background (port 3000)
echo [3/3] Starting Valyze Client Portal (port 3000)...
echo    Valyze Client Portal starting in background...
cd /d "%~dp0valyze-portal"
start /B npm run dev

:: Wait for frontend to start
timeout /t 5 /nobreak >nul

echo.
echo ============================================
echo   SYSTEM STARTED IN SINGLE CONSOLE!
echo ============================================
echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:1573
echo   Valyze Client Portal: http://localhost:3000
echo.
echo   ALL logs will appear in this console
echo.
echo   Press Ctrl+C to stop all services
echo.

:: Keep the window open and show backend logs
pause