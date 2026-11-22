@echo off
rem Shahr Credit Advisor - PC edition launcher (opens as a desktop window)
set "APP=%~dp0index.html"
where msedge >nul 2>nul && (start "" msedge --app="file:///%APP%" --window-size=1440,900 & exit /b)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="file:///%APP%" --window-size=1440,900 & exit /b)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="file:///%APP%" --window-size=1440,900 & exit /b)
start "" "%APP%"
