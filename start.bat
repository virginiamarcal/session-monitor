@echo off
title Virginia Session Monitor
echo.
echo   Reiniciando Session Monitor...
echo.
echo   Encerrando instancia travada (se houver)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4242" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo   Subindo servidor...
start "" node "%~dp0server.js"
ping -n 3 127.0.0.1 >nul
echo   Abrindo http://localhost:4242
start "" http://localhost:4242
