@echo off
cd /d "%~dp0"
node scripts\installer.mjs %*
echo.
pause
