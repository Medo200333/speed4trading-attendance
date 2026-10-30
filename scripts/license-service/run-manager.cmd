@echo off
rem Speed License Manager behind tailscale serve (tailnet only). Restart loop.
cd /d C:\ProgramData\SpeedLicense
set NO_OPEN=1
set SPEED_MANAGER_HOSTS=desktop-gd5rj4m-1.tailc255fa.ts.net:8447
:loop
"C:\Program Files\nodejs\node.exe" manager.mjs >> manager.log 2>&1
timeout /t 5 /nobreak >nul
goto loop
