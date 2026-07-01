@echo off
setlocal

set "SERVER_URL=https://raid-lead-dashboard.onrender.com"
set "REPORT_URL=https://www.warcraftlogs.com/reports/9cCvwW7hpDZ4Jz2x"
set "CHAT_LOG=%ProgramFiles(x86)%\World of Warcraft\_retail_\Logs\WoWChatLog.txt"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  echo Install the LTS version from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "%CHAT_LOG%" (
  echo Could not find WoWChatLog.txt at:
  echo %CHAT_LOG%
  echo.
  echo Edit run-chatlog-uploader.cmd and set CHAT_LOG to your WoWChatLog.txt path.
  pause
  exit /b 1
)

echo Starting Raid Lead Dashboard chat log uploader.
echo Server: %SERVER_URL%
echo Report: %REPORT_URL%
echo Chat log: %CHAT_LOG%
echo.
echo Leave this window open while raiding.
echo.

node "%~dp0chatlog-uploader.mjs" --server "%SERVER_URL%" --report-url "%REPORT_URL%" --file "%CHAT_LOG%"
pause
