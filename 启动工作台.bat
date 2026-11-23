@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动我的工作台...
python server.py
pause
