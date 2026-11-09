@echo off
rem Starts the local dev server for the Yunamii website and opens it in the browser.
rem Stop the server with Ctrl+C or by closing this window.
cd /d "%~dp0"
title Yunamii dev server (http://localhost:5175)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5175"
python tools\dev-server.py site 5175
pause
