@echo off
title Valyze Credit Report - Stopping All Services
color 0C
echo.
echo ============================================
echo VALYZE CREDIT REPORT - STOPPING ALL SERVICES
echo ============================================
echo.

:: Find and kill Python processes (backend)
echo Stopping Backend (port 8000)...
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq python.exe" /fo table /nh') do (
    taskkill /f /pid %%i >nul 2>&1
)
echo Backend stopped.

:: Find and kill Node processes (frontend and extractor)
echo Stopping Frontend (port 1573) and Extractor (port 5174)...
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo table /nh') do (
    taskkill /f /pid %%i >nul 2>&1
)
echo Frontend and Extractor stopped.

echo.
echo ============================================
echo   ALL SERVICES STOPPED
echo ============================================
echo.
pause