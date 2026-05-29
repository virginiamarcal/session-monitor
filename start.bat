@echo off
title Virginia Session Monitor
echo.
echo   Iniciando Session Monitor...
echo   Abrindo http://localhost:4242
echo.
start "" http://localhost:4242
node "%~dp0server.js"
pause
