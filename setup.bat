@echo off
echo.
echo  ================================================
echo   Diet Logger - Setup ^& Start
echo  ================================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Python is not installed!
    echo  Download it from: https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo  [1/3] Python found. Installing dependencies...
pip install -r requirements.txt --quiet

if %errorlevel% neq 0 (
    echo  [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo  [2/3] Dependencies installed.
echo  [3/3] Starting Diet Logger server...
echo.
echo  ================================================
echo   Open in Chrome on your PC:
echo     http://localhost:5000
echo.
echo   Open on your Android phone (same WiFi):
echo     Check the IP printed below
echo  ================================================
echo.

python server.py
pause
