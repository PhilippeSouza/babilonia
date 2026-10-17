@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Recompila o launcher (Babilônia Buff.exe) a partir de src\BabiloniaLauncher.cs
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
"%CSC%" /nologo /codepage:65001 /target:winexe /win32icon:"Babilônia Buff-icone.ico" /out:"Babilônia Buff.exe" /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll src\BabiloniaLauncher.cs src\BabiloniaOverlay.cs
if errorlevel 1 (echo Falha ao compilar.) else (echo Babilônia Buff.exe atualizado.)
pause
