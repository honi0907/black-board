@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js がインストールされていません。
  echo  https://nodejs.org/ から LTS 版をインストールしてから、もう一度実行してください。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\" (
  echo.
  echo  初回セットアップ中（npm install）...
  echo  Electron のダウンロードに数分かかる場合があります。
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  セットアップに失敗しました。
    pause
    exit /b 1
  )
)

echo  古いサーバーが残っていれば終了します...
node scripts\free-port.js 3000

echo.
echo  Black Board（Electron）を起動しています...
echo  終了するにはアプリウィンドウを閉じてください。
echo.

call npm run electron

if errorlevel 1 pause
