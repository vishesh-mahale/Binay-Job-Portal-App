@echo off
echo Starting all services...

REM Local/dev should use the Cloud-hosted ClamAV endpoint configured in the FastAPI .env.
REM Do not start a local ClamAV/clamd daemon here; production keeps ClamAV private/internal.

start "FastAPI AI Worker - Port 8080" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\07-fastapi-ai-worker && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080"

start "NestJS API - Port 3000" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\04-nestjs-api\04-nestjs-api-app && node dist\src\main.js"

start "Outbox Dispatcher - Port 3002" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\05-outbox-dispatcher-nestjs && npm run build && node dist\main.js"

start "Next.js Web App - Port 3001" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\03-nextjs-web\03-nextjs-web-app && npx next dev -p 3001"

start "Wake Loop - 10 sec" cmd /k "pushd C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App && powershell.exe -ExecutionPolicy Bypass -File wake-dispatcher.ps1"

echo All 5 services started in separate windows.
pause
