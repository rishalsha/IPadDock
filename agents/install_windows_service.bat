@echo off
:: Windows Autostart Setup for iPad Dock PC Agent
:: Creates a hidden Task in Windows Task Scheduler to run on boot / user login

echo ========================================================
echo   iPad Dock: PC Agent Windows Setup
echo ========================================================

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python is not installed or not in PATH. Please install Python 3.
    pause
    exit /b 1
)

echo [*] Installing required Python packages...
pip install -r "%~dp0requirements.txt"

set SCRIPT_PATH=%~dp0pc_agent.py
set AGENT_NAME=IPadDockPCAgent

echo [*] Creating scheduled task to run silently on login...
schtasks /create /tn "%AGENT_NAME%" /tr "pythonw.exe \"%SCRIPT_PATH%\" --host YOUR_AZURE_IP --topic desktop_pc" /sc onlogon /rl highest /f

if %errorlevel% equ 0 (
    echo.
    echo [+] SUCCESS! Task "%AGENT_NAME%" created.
    echo [*] Note: Edit the Azure IP address in the task via Task Scheduler or config file.
    echo [*] Starting agent now...
    schtasks /run /tn "%AGENT_NAME%"
) else (
    echo [-] Failed to create scheduled task. Please run as Administrator.
)

pause
