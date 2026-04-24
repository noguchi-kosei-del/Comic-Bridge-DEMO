@echo off
setlocal EnableDelayedExpansion

echo ========================================
echo   COMIC-Bridge dev server
echo ========================================
echo.

cd /d "%~dp0"

REM --- Check required tools ---
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

where cargo >nul 2>&1
if errorlevel 1 (
    echo [ERROR] cargo not found. Please install Rust from https://www.rust-lang.org/tools/install
    pause
    exit /b 1
)

REM --- Install node_modules if missing or tauri CLI is missing ---
set "NEED_NPM_INSTALL="
if not exist "node_modules" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\.bin\tauri.cmd" set "NEED_NPM_INSTALL=1"

if defined NEED_NPM_INSTALL (
    echo [setup] Installing npm dependencies...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

REM --- Download pdfium.dll if missing ---
set "PDFIUM_DLL=src-tauri\resources\pdfium\pdfium.dll"
if not exist "%PDFIUM_DLL%" call :download_pdfium
if not exist "%PDFIUM_DLL%" (
    echo [ERROR] pdfium.dll setup failed.
    pause
    exit /b 1
)

echo Launching: npm run tauri dev
echo.

call npm run tauri dev

pause
exit /b 0


REM ================================================================
REM  Subroutine: download pdfium.dll
REM ================================================================
:download_pdfium
echo [setup] pdfium.dll not found. Downloading...
if not exist "src-tauri\resources\pdfium" mkdir "src-tauri\resources\pdfium"

set "PDFIUM_TGZ=%TEMP%\pdfium-win-x64.tgz"
set "PDFIUM_EXTRACT=%TEMP%\pdfium-extract"

if exist "%PDFIUM_EXTRACT%" rmdir /s /q "%PDFIUM_EXTRACT%"
mkdir "%PDFIUM_EXTRACT%"

curl -L -o "%PDFIUM_TGZ%" "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz"
if errorlevel 1 (
    echo [ERROR] Failed to download pdfium.
    exit /b 1
)

tar -xzf "%PDFIUM_TGZ%" -C "%PDFIUM_EXTRACT%"
if errorlevel 1 (
    echo [ERROR] Failed to extract pdfium archive.
    exit /b 1
)

set "FOUND_DLL="
for /r "%PDFIUM_EXTRACT%" %%F in (pdfium.dll) do (
    if not defined FOUND_DLL set "FOUND_DLL=%%F"
)
if not defined FOUND_DLL (
    echo [ERROR] pdfium.dll not found in extracted archive.
    exit /b 1
)
copy /y "%FOUND_DLL%" "%PDFIUM_DLL%" >nul

del /q "%PDFIUM_TGZ%" 2>nul
rmdir /s /q "%PDFIUM_EXTRACT%" 2>nul
echo [setup] pdfium.dll placed at %PDFIUM_DLL%
echo.
exit /b 0
