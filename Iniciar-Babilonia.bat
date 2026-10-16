@echo off
cd /d "%~dp0"
for %%F in ("Babil*nia Buff.exe") do (
    start "" "%%F"
    exit
)
start "" http://localhost:3000
node server.js
