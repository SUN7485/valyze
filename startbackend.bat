@echo off
title Valyze - Backend
cd /d "%~dp0backend"
set PYTHONIOENCODING=utf-8
py -m uvicorn main:app --reload --port 8000
pause
