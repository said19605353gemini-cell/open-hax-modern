@echo off
setlocal
title OpenHax Modern - Vite Haxball
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi!
    pause
    exit /b 1
)

if not exist "node_modules" (
    call npm.cmd install --no-audit --no-fund
    if errorlevel 1 (
        echo [HATA] npm install basarisiz oldu.
        pause
        exit /b 1
    )
)

echo OpenHax Modern baslatiliyor: http://localhost:5173
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul && start http://localhost:5173"
call npm.cmd run dev -- --port 5173
pause
