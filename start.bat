@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ძველი სერვერის გაჩერება...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo.
echo ========================================
echo   ფინანსური Dashboard
echo ========================================
echo   ადმინ:    http://localhost:3000
echo   ქუთაისი:  http://localhost:3000/f/kut-a8f3
echo   ლილო:     http://localhost:3000/f/lil-b2c9
echo   დიღომი:   http://localhost:3000/f/dig-c5e1
echo ========================================
echo.
echo სერვერი ირთვება... (პირველი გახსნა 5-10 წამი შეიძლება გრძელდეს)
echo.

npm run dev
