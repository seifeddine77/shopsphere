@echo off
echo Arret des processus ShopSphere (node)...
taskkill /F /IM node.exe >nul 2>&1
echo Termine.
pause
