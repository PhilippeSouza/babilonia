@echo off
cd /d "%~dp0"
if exist "Babilonia.exe" (
    start "" "Babilonia.exe"
    exit
)
start "" http://localhost:3000
node server.js
