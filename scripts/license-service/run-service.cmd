@echo off
cd /d C:\ProgramData\SpeedLicense
:again
"C:\Program Files\nodejs\node.exe" license-service.mjs >> C:\ProgramData\SpeedLicense\service.log 2>&1
ping -n 6 127.0.0.1 >nul
goto again
