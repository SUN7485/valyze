@echo off
title Valyze Backend - Log Console
color 0B
echo.
echo ============================================
echo VALYZE BACKEND - STARTING
echo ============================================
echo.

:: Create required directories
cd /d "%~dp0"
if not exist "backend\uploads" mkdir backend\uploads
if not exist "backend\outputs" mkdir backend\outputs

:: Start Backend in the SAME window with clear logging
echo Starting Backend (port 8000)...
echo Backend logs will appear below...
echo ============================================
echo.

cd /d "%~dp0backend"
set PYTHONIOENCODING=utf-8
py -3.12 -m uvicorn main:app --reload --port 8000

echo.
echo ============================================
echo Backend stopped.
pause