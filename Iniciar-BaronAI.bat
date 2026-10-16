@echo off
title BaronAI - LoL Live Companion & AI Coach
echo ==============================================================
echo   Iniciando BaronAI (LoL Live Companion e Coach de IA)...
echo ==============================================================
start "" "http://localhost:3000"
node "%~dp0server.js"
pause
