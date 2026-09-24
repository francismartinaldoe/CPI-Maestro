@echo off
:: CPI Certificate Expiry Monitor — Weekly Runner
:: Set up in Windows Task Scheduler to run every Monday at 08:00
:: Action: Start a program → Browse to this .bat file

cd /d "%~dp0\.."
python scripts\cert_expiry_monitor.py >> logs\cert_monitor.log 2>&1
