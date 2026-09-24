@echo off
echo.
echo ===================================================
echo  MAESTRO — SAP CPI Intelligence Orchestrator
echo ===================================================
echo.
echo BEFORE starting:
echo  1. Open maestro\.env and set ANTHROPIC_API_KEY
echo.
echo Starting Maestro orchestrator...
start "Maestro Orchestrator" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Maestro launched. Type your request in the window.
