@echo off
titleValyze Credit report - Frontend
color 0D
echo.
echo   Starting Frontend Dev Server...
echo   http://localhost:5173
echo   Press Ctrl+C to stop
echo.

cd /d "%~dp0frontend"
npm run dev
pause