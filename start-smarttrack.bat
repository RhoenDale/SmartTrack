@echo off
title SmartTrack Pharmacy System Launcher
echo ===================================================
echo   SmartTrack - Offline Pharmacy Management System
echo ===================================================
echo Starting SmartTrack services...

:: 1. Auto-start XAMPP Apache and MySQL if installed at C:\xampp
if exist "C:\xampp\apache_start.bat" (
    echo Checking database and web server...
    tasklist /FI "IMAGENAME eq httpd.exe" 2>NUL | find /I /N "httpd.exe">NUL
    if "%ERRORLEVEL%"=="1" (
        start /B "" "C:\xampp\apache\bin\httpd.exe"
    )
    tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I /N "mysqld.exe">NUL
    if "%ERRORLEVEL%"=="1" (
        start /B "" "C:\xampp\mysql\bin\mysqld.exe"
    )
)

:: 2. Launch SmartTrack Desktop Application or Offline Browser
if exist "release\win-unpacked\SmartTrack.exe" (
    echo Launching SmartTrack Desktop App...
    start "" "release\win-unpacked\SmartTrack.exe"
) else (
    echo Opening SmartTrack in your browser...
    start http://localhost/SmartTrack/
)

echo SmartTrack is ready.
timeout /t 3 >nul
exit

