@echo off
title Insuco LabControl - Acceso desde el celular
cd /d "%~dp0website\backend"

rem Si el servidor no esta corriendo, iniciarlo oculto y esperar
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) { Write-Host 'Iniciando servidor de Insuco LabControl...' ; Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden ; Start-Sleep -Seconds 2 }"

rem Mostrar la direccion y el codigo QR para escanear con el celular
chcp 65001 >nul
node "%~dp0celular.js"

echo.
pause
