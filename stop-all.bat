@echo off
rem Stop whatever is listening on the backend (8000) and frontend (1573) ports.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000 :1573" ^| findstr LISTENING') do taskkill /F /T /PID %%p >nul 2>&1
echo Valyze services stopped.
