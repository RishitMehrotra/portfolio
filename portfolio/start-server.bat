@echo off
title Portfolio Local 3D Server
echo ========================================================
echo   Starting Local Server for 3D Models & 4K EXR HDRI...
echo ========================================================
echo.

cd /d "%~dp0"

:: Check if Python is installed
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Python detected. Starting server at http://localhost:8000/portfolio.html...
    start http://localhost:8000/portfolio.html
    python -m http.server 8000
    goto end
)

:: Check if Node / npx is installed
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node/npx detected. Starting server at http://localhost:8000/portfolio.html...
    start http://localhost:8000/portfolio.html
    npx serve -l 8000
    goto end
)

:: Use built-in Windows PowerShell Server (no installs needed!)
echo [OK] Using built-in Windows PowerShell HTTP Server (Zero installs needed)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

:end
pause
