@echo off
setlocal
title OfferTrack

cd /d "%~dp0"

set "OFFERTRACK_NODE=%~dp0.tools\node"
set "NEXT_TELEMETRY_DISABLED=1"

if not exist "%OFFERTRACK_NODE%\node.exe" (
  echo.
  echo [ERROR] Project-local Node.js was not found:
  echo %OFFERTRACK_NODE%\node.exe
  echo.
  pause
  exit /b 1
)

set "PATH=%OFFERTRACK_NODE%;%PATH%"

if not exist "%~dp0node_modules\next\package.json" (
  echo.
  echo [ERROR] Project dependencies are missing.
  echo Please install dependencies in the OfferTrack project directory before starting.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0.next\BUILD_ID" (
  echo [OfferTrack] Creating the production build. Please wait...
  call npm.cmd run build
  if errorlevel 1 (
    echo.
    echo [ERROR] The OfferTrack production build failed.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo [OfferTrack] Starting...
echo [OfferTrack] URL: http://localhost:3000
echo [OfferTrack] Press Ctrl+C in this window to stop.
echo.

if not defined OFFERTRACK_NO_BROWSER (
  start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$url='http://localhost:3000'; for($i=0; $i -lt 60; $i++){ try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1 ^| Out-Null; Start-Process $url; break } catch { Start-Sleep -Milliseconds 500 } }"
)

call npm.cmd run start
set "OFFERTRACK_EXIT_CODE=%ERRORLEVEL%"

if not "%OFFERTRACK_EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] OfferTrack failed to start or exited unexpectedly.
  echo If port 3000 is busy, close the program currently using that port.
  echo.
  pause
)

endlocal & exit /b %OFFERTRACK_EXIT_CODE%
