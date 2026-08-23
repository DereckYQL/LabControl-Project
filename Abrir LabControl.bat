@echo off
title Insuco LabControl
cd /d "%~dp0website\backend"

rem Si el servidor no esta corriendo, iniciarlo oculto y esperar
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) { Write-Host 'Iniciando servidor de Insuco LabControl...' ; Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden ; Start-Sleep -Seconds 2 }"

start "" "http://localhost:3000/login.html"
