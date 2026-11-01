@echo off
title LogSheet - Local Server

REM =====================================
REM  LogSheet - Local Server
REM  Static file server for the plain HTML app
REM =====================================
REM  1) Edit APP_DIR below to the folder that contains index.html
REM  2) SERVER_MODE: "serve"  = simple static server (no Vercel login needed)
REM                  "vercel" = vercel dev, same as OneCoreApp

set "NODE_DIR=C:\Installer\node-v22.18.0-win-x64"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NODE_EXTRA_CA_CERTS=C:\Installer\Netskope\netskope-root.cer"
set "NPX_CMD=%NODE_DIR%\npx.cmd"
set "APP_DIR=C:\Installer\Apps\PCaresApp"
set "PORT=3010"
set "SERVER_MODE=serve"

set "PATH=%NODE_DIR%;%PATH%"

if /i "%SERVER_MODE%"=="vercel" (
    set "SERVER_CMD=%NPX_CMD% vercel dev --listen %PORT% --yes"
) else (
    set "SERVER_CMD=%NPX_CMD% --yes serve . -l %PORT% --no-clipboard"
)

echo.
echo  ============================================
echo   LogSheet - Local Server
echo  ============================================
echo.

if not exist "%NODE_EXE%" (
    echo  ERROR: Node.js not found at %NODE_EXE%
    pause
    exit /b 1
)

if not exist "%APP_DIR%\index.html" (
    echo  ERROR: index.html not found in %APP_DIR%
    echo  Edit APP_DIR at the top of this file.
    pause
    exit /b 1
)

REM -- Warn if Supabase keys are not filled in yet
findstr /c:"YOUR-PROJECT-REF" "%APP_DIR%\js\config.js" >nul 2>&1
if not errorlevel 1 (
    echo  WARNING: js\config.js still has placeholder Supabase values.
    echo           Add your Project URL and anon key, then refresh the browser.
    echo.
)

REM -- Kill anything already on PORT
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%.*LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Starting LogSheet on port %PORT% (%SERVER_MODE% mode)...
echo.

start "LogSheet Server" cmd /k "set PATH=%NODE_DIR%;%PATH% && set NODE_EXTRA_CA_CERTS=%NODE_EXTRA_CA_CERTS% && cd /d %APP_DIR% && %SERVER_CMD%"

echo  Waiting for server to start...
set /a tries=0

:waitloop
timeout /t 2 /nobreak >nul
set /a tries+=1
netstat -an | findstr ":%PORT%.*LISTENING" >nul 2>&1
if not errorlevel 1 goto started
if %tries% GEQ 45 (
    echo.
    echo  Server did not start within 90 seconds. Check the "LogSheet Server" window for errors.
    pause
    exit /b 1
)
goto waitloop

:started
echo.
echo  LogSheet is running!
echo.
echo  Open: http://localhost:%PORT%
echo.
start "" http://localhost:%PORT%

echo  ============================================
echo  Commands: BROWSER, RESTART, STATUS, STOP
echo  ============================================
echo.

:commandloop
set /p "cmd=  Command: "

if /i "%cmd%"=="browser" (
    start "" http://localhost:%PORT%
    goto commandloop
)

if /i "%cmd%"=="status" (
    netstat -an | findstr ":%PORT%.*LISTENING" >nul 2>&1
    if errorlevel 1 (
        echo  Server is NOT running
    ) else (
        echo  Server is running at http://localhost:%PORT%
    )
    goto commandloop
)

if /i "%cmd%"=="restart" (
    echo  Restarting...

    taskkill /FI "WindowTitle eq LogSheet Server*" /F >nul 2>&1

    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%.*LISTENING" 2^>nul') do (
        taskkill /PID %%a /F >nul 2>&1
    )

    timeout /t 2 /nobreak >nul

    start "LogSheet Server" cmd /k "set PATH=%NODE_DIR%;%PATH% && set NODE_EXTRA_CA_CERTS=%NODE_EXTRA_CA_CERTS% && cd /d %APP_DIR% && %SERVER_CMD%"

    echo  Waiting...

:restartloop
    timeout /t 2 /nobreak >nul
    netstat -an | findstr ":%PORT%.*LISTENING" >nul 2>&1
    if errorlevel 1 goto restartloop

    echo  Restarted!
    start "" http://localhost:%PORT%
    goto commandloop
)

if /i "%cmd%"=="stop" goto stopserver

echo  Unknown command. Try: BROWSER, STATUS, RESTART, STOP
goto commandloop

:stopserver
echo.
echo  Stopping LogSheet...

taskkill /FI "WindowTitle eq LogSheet Server*" /F >nul 2>&1

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%.*LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo  Stopped.
echo.
pause
exit
