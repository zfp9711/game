@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   守灯 · Lanternwatch
echo   正在启动本地服务器...
echo.
node server.mjs --open
pause
