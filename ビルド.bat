@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js がインストールされていません。
  pause
  exit /b 1
)

if not exist "node_modules\electron-builder\" (
  echo セットアップ中...
  call npm install
)

echo.
echo  ホスト用・接続用のインストーラをビルドしています...
echo  数分かかる場合があります。
echo.

set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run build:win

echo.
if exist "dist\Black Board-Setup-1.0.0.exe" (
  echo  ホスト用: dist\Black Board-Setup-1.0.0.exe
)
if exist "dist\Black Board Connect-Setup-1.0.0.exe" (
  echo  接続用:   dist\Black Board Connect-Setup-1.0.0.exe
)
echo.
echo  生成された Setup.exe を配布してください。
echo  インストール後はスタートメニュー・デスクトップから起動できます。
echo.
pause
