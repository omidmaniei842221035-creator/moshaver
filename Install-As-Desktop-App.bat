@echo off
rem Optional: serve over http://localhost:8765 so the app can be INSTALLED as a desktop app (PWA) and works fully offline.
rem Requires Python 3 (python.org). Close this window to stop.
cd /d "%~dp0"
start "" http://localhost:8765/index.html
python -m http.server 8765 --bind 127.0.0.1 || py -m http.server 8765 --bind 127.0.0.1
pause
