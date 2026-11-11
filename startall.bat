@echo off
title Valyze - Backend + Frontend
cd /d "%~dp0"

start "Valyze Backend" /D "%~dp0backend" cmd /k "set PYTHONIOENCODING=utf-8 && py -m uvicorn main:app --reload --port 8000"
start "Valyze Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

echo Backend:  http://localhost:8000  (API docs at /docs)
echo Frontend: http://localhost:1573
echo Client portal: http://localhost:1573/portal?token=^<link token^>
echo.
echo Each service runs in its own window. Close them, or run stop-all.bat, to stop.
