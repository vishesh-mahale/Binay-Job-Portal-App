@echo off
title Service Manager - Binay Job Portal
color 0A

:MENU
cls
echo ============================================================
echo        BINAY JOB PORTAL - SERVICE MANAGER
echo ============================================================
echo.
echo   [1] Next.js Web App        (Port 3001)
echo   [2] NestJS API             (Port 3000)
echo   [3] Outbox Dispatcher      (Port 3002)
echo   [4] FastAPI AI Worker      (Port 8080)
echo   [5] Wake Loop              (PowerShell)
echo.
echo   [6] START ALL SERVICES
echo   [7] STOP ALL SERVICES
echo   [8] RESTART ALL SERVICES
echo.
echo   [9] RUN STANDALONE TEST PARSER (test_parser.py)
echo.
echo   [0] EXIT
echo.
echo ============================================================
set /p choice="Enter your choice: "

if "%choice%"=="1" goto RESTART_NEXTJS
if "%choice%"=="2" goto RESTART_NESTJS
if "%choice%"=="3" goto RESTART_DISPATCHER
if "%choice%"=="4" goto RESTART_FASTAPI
if "%choice%"=="5" goto RESTART_WAKE
if "%choice%"=="6" goto START_ALL
if "%choice%"=="7" goto STOP_ALL
if "%choice%"=="8" goto RESTART_ALL
if "%choice%"=="9" goto RUN_TEST_PARSER
if "%choice%"=="0" goto EXIT
echo Invalid choice! Press any key to try again...
pause >nul
goto MENU

REM ============================================================
REM RESTART INDIVIDUAL SERVICES
REM ============================================================

:RESTART_NEXTJS
echo.
echo Stopping Next.js Web App (Port 3001)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 >nul
echo Starting Next.js Web App...
start "Next.js Web App - Port 3001" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\03-nextjs-web\03-nextjs-web-app && npx next dev -p 3001"
echo Done! Next.js Web App restarted on Port 3001.
timeout /t 2 >nul
goto MENU

:RESTART_NESTJS
echo.
echo Stopping NestJS API (Port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 >nul
echo Starting NestJS API...
start "NestJS API - Port 3000" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\04-nestjs-api\04-nestjs-api-app && npm run build && node dist\src\main.js"
echo Done! NestJS API restarted on Port 3000.
timeout /t 2 >nul
goto MENU

:RESTART_DISPATCHER
echo.
echo Stopping Outbox Dispatcher (Port 3002)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 >nul
echo Starting Outbox Dispatcher...
start "Outbox Dispatcher - Port 3002" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\05-outbox-dispatcher-nestjs && npm run build && node dist\main.js"
echo Done! Outbox Dispatcher restarted on Port 3002.
timeout /t 2 >nul
goto MENU

:RESTART_FASTAPI
echo.
echo Stopping FastAPI AI Worker (Port 8080)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 >nul
echo Starting FastAPI AI Worker...
start "FastAPI AI Worker - Port 8080" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\07-fastapi-ai-worker && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080"
echo Done! FastAPI AI Worker restarted on Port 8080.
timeout /t 2 >nul
goto MENU

:RESTART_WAKE
echo.
echo Stopping Wake Loop...
taskkill /FI "WINDOWTITLE eq Wake Loop*" /F >nul 2>&1
timeout /t 1 >nul
echo Starting Wake Loop...
start "Wake Loop - 10 sec" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App && powershell.exe -ExecutionPolicy Bypass -File wake-dispatcher.ps1"
echo Done! Wake Loop restarted.
timeout /t 2 >nul
goto MENU

:RUN_TEST_PARSER
echo.
echo ============================================================
echo        RUN STANDALONE RESUME PARSER (test_parser.py)
echo ============================================================
echo.
set /p rpath="Enter resume file path (or drag & drop resume file here): "
if "%rpath%"=="" goto MENU
set rpath=%rpath:&=%
set rpath=%rpath:'=%
set rpath=%rpath:"=%
echo.
echo Starting Test Parser in a new window...
start "Test Parser - Standalone LLM Test" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\07-fastapi-ai-worker && .venv\Scripts\python.exe test_parser.py "%rpath%""
echo Done! Test Parser opened in a separate window.
timeout /t 3 >nul
goto MENU

REM ============================================================
REM START ALL
REM ============================================================

:START_ALL
echo.
echo Starting all services...
call :START_FASTAPI_SILENT
call :START_NESTJS_SILENT
call :START_DISPATCHER_SILENT
call :START_NEXTJS_SILENT
call :START_WAKE_SILENT
echo.
echo All 5 services started!
timeout /t 2 >nul
goto MENU

:START_FASTAPI_SILENT
echo   Starting FastAPI AI Worker (Port 8080)...
start "FastAPI AI Worker - Port 8080" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\07-fastapi-ai-worker && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080"
goto :eof

:START_NESTJS_SILENT
echo   Starting NestJS API (Port 3000)...
start "NestJS API - Port 3000" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\04-nestjs-api\04-nestjs-api-app && npm run build && node dist\src\main.js"
goto :eof

:START_DISPATCHER_SILENT
echo   Starting Outbox Dispatcher (Port 3002)...
start "Outbox Dispatcher - Port 3002" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\05-outbox-dispatcher-nestjs && npm run build && node dist\main.js"
goto :eof

:START_NEXTJS_SILENT
echo   Starting Next.js Web App (Port 3001)...
start "Next.js Web App - Port 3001" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\03-nextjs-web\03-nextjs-web-app && npx next dev -p 3001"
goto :eof

:START_WAKE_SILENT
echo   Starting Wake Loop...
start "Wake Loop - 10 sec" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App && powershell.exe -ExecutionPolicy Bypass -File wake-dispatcher.ps1"
goto :eof

REM ============================================================
REM STOP ALL
REM ============================================================

:STOP_ALL
echo.
echo Stopping all services...

echo   Stopping FastAPI AI Worker (Port 8080)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo   Stopping NestJS API (Port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo   Stopping Outbox Dispatcher (Port 3002)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo   Stopping Next.js Web App (Port 3001)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo   Stopping Wake Loop...
taskkill /FI "WINDOWTITLE eq Wake Loop*" /F >nul 2>&1

echo.
echo All services stopped!
timeout /t 2 >nul
goto MENU

REM ============================================================
REM RESTART ALL
REM ============================================================

:RESTART_ALL
echo.
call :STOP_ALL_Q
echo.
echo Restarting all services...
timeout /t 2 >nul
call :START_FASTAPI_SILENT
call :START_NESTJS_SILENT
call :START_DISPATCHER_SILENT
call :START_NEXTJS_SILENT
call :START_WAKE_SILENT
echo.
echo All 5 services restarted!
timeout /t 2 >nul
goto MENU

:STOP_ALL_Q
taskkill /FI "WINDOWTITLE eq FastAPI AI Worker*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq NestJS API*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Outbox Dispatcher*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Next.js Web App*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Wake Loop*" /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
goto :eof

:EXIT
exit
