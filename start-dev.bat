@echo off
title ShopSphere - serveur de developpement
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo ================================================
echo   ShopSphere - demarrage (Mongo en memoire)
echo   Le navigateur va s'ouvrir sur localhost:3000
echo   Comptes de demo :
echo     admin@shopsphere.test    / Admin123!
echo     customer@shopsphere.test / Customer123!
echo   Fermez cette fenetre pour arreter le serveur
echo ================================================
echo.

start "" http://localhost:3000
node src\scripts\dev-memory.js
pause
