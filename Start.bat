@echo off
title PeachyKareoke Launcher
echo ====================================
echo Starting PeachyKareoke...
echo ====================================

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org to run from source.
    pause
    exit /b
)

:: Install dependencies if missing
IF NOT EXIST "node_modules" (
    echo First time setup: Installing dependencies...
    call npm install
)

:: Launch the app
echo Launching...
call npm start
