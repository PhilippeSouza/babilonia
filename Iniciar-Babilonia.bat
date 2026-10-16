@echo off
title Babilonia - LoL Live Companion (Dracula Edition)
echo ==============================================================
echo   Iniciando BABILONIA (LoL Live Companion e Coach IA)...
echo ==============================================================
start "" "http://localhost:3000"
node "%~dp0server.js"
pause
