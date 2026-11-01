@echo off
setlocal enabledelayedexpansion
cd /d C:\Installer\Apps\PCaresApp

set PATH=C:\Installer\MinGit-2.55.0.5-64-bit\cmd;%PATH%

if not exist ".git" (
    echo.
    echo  This folder is not a Git repository yet.
    echo  Do the one-time setup first ^(git init, git remote add origin ...^).
    echo.
    pause
    exit /b 1
)

REM -- Safety: make sure patient data and local files are never uploaded
if not exist ".gitignore" (
    (
        echo # Never upload patient data or local files
        echo data/
        echo backup/
        echo *.db
        echo *.db-wal
        echo *.db-shm
        echo node_modules/
        echo .vercel/
        echo *.log
        echo Thumbs.db
        echo desktop.ini
    ) > ".gitignore"
    echo  Created .gitignore
)
if not exist ".vercelignore" (
    (
        echo # Files that must not be published on the website
        echo git-push.bat
        echo PCaresApp.bat
        echo README.md
        echo serve.json
        echo supabase/
        echo data/
        echo backup/
    ) > ".vercelignore"
    echo  Created .vercelignore
)

:menu
echo.
echo  ============================================
echo   PCaresApp - Git Push
echo  ============================================
echo.
git status -s
echo.
echo  1. Push ALL changed files
echo  2. Push SELECTED files
echo  3. Cancel
echo  4. RELEASE (bump version, commit and push version file)
echo.
set /p "choice=Choose an option (1-4): "

if "%choice%"=="1" goto pushall
if "%choice%"=="2" goto pushselected
if "%choice%"=="3" goto :eof
if "%choice%"=="4" goto release
echo  Invalid choice.
goto menu

:pushall
git add -A
goto commit

:pushselected
echo.
echo  Enter file paths separated by spaces, relative to the project root.
echo  Example: js\login.js css\global.css
set /p "files=Files: "
if "%files%"=="" (
    echo  No files entered.
    goto menu
)
git add %files%
goto commit

:commit
echo.
set /p "msg=Commit message (blank = "Update files"): "
if "%msg%"=="" set "msg=Update files"
git commit -m "%msg%"
if errorlevel 1 (
    echo.
    echo  Nothing staged, or commit failed. Nothing was pushed.
    pause
    exit /b 1
)

echo.
git push -u origin HEAD
if errorlevel 1 (
    echo.
    echo  Push failed. Check the error above ^(auth, conflicts, no remote, etc.^).
    pause
    exit /b 1
)

echo.
echo  Done. Changes pushed to GitHub. Vercel updates the website in about a minute.
echo.
set "askrel="
set /p "askrel=Will this need a release version bump? (Y/N): "
if /i "%askrel%"=="Y" goto release
echo.
echo  Press any key to exit.
pause >nul
exit /b 0

:release
echo.
echo  ============================================
echo   RELEASE - bump version
echo  ============================================

if not exist "js\config.js" (
    echo  Cannot find js\config.js
    goto menu
)

set "curver="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Select-String -Path 'js\config.js' -Pattern 'APP_VERSION:\s*''([0-9][0-9A-Za-z.-]*)''').Matches[0].Groups[1].Value"`) do set "curver=%%V"
echo.
echo  Current version: %curver%
set "newver="
set /p "newver=New version (example 1.1.0, blank = cancel): "
if "%newver%"=="" goto menu

echo !newver!| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul
if errorlevel 1 (
    echo.
    echo  Invalid format. Use numbers like 1.1.0
    goto menu
)
if "%newver%"=="%curver%" (
    echo.
    echo  That is already the current version. Enter a new one.
    goto menu
)

echo.
echo  This will:
echo    - set APP_VERSION to %newver% in js\config.js
echo    - commit and push ONLY that file
set "ok="
set /p "ok=Proceed? (Y/N): "
if /i not "%ok%"=="Y" goto menu

powershell -NoProfile -Command "$v='!newver!'; $f='js\config.js'; $a=[IO.File]::ReadAllText($f); if($a -notmatch 'APP_VERSION:\s*''[^'']*'''){Write-Host 'ERROR: could not find APP_VERSION.'; exit 1}; $a=[regex]::Replace($a,'APP_VERSION:\s*''[^'']*''','APP_VERSION: '''+$v+''''); [IO.File]::WriteAllText($f,$a); Write-Host ('  config.js: APP_VERSION '+$v)"
if errorlevel 1 (
    echo.
    echo  Version update failed. Nothing was changed or pushed.
    pause
    goto menu
)

git add js\config.js
git commit -m "Release !newver!" -- js\config.js
if errorlevel 1 (
    echo.
    echo  Commit failed. Nothing was pushed.
    pause
    exit /b 1
)

echo.
git push -u origin HEAD
if errorlevel 1 (
    echo.
    echo  Push failed. Check the error above ^(auth, conflicts, no remote, etc.^).
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   Release !newver! pushed.
echo.
echo   Vercel publishes it automatically in about a minute.
echo   Staff may need to refresh the page ^(Ctrl+F5^) to see the new version.
echo  ============================================
echo.
pause
exit /b 0
