@echo off
title Insuco LabControl - Acceso desde el celular - v2.1
cd /d "%~dp0website\backend"

rem Detener cualquier servidor anterior que este usando el puerto 3000
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

rem Iniciar el servidor de esta version (2.1)
powershell -NoProfile -Command "Write-Host 'Iniciando servidor de Insuco LabControl v2.1...' ; Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%~dp0website\backend' -WindowStyle Hidden"
timeout /t 3 /nobreak >nul

rem Mostrar la direccion y el codigo QR para escanear con el celular
chcp 65001 >nul
node "%~dp0celular.js"

echo.
pause
