@echo off
rem Cai chung chi ky code cua Master Scoring vao may nay (chay 1 lan, can quyen Administrator).
rem Sau khi cai, Windows se nhan dien bo cai Master Scoring la "da ky" boi nha phat hanh "Master Scoring".
rem Dat file nay cung thu muc voi MasterScoring-CodeSign.cer roi: chuot phai -> Run as administrator.

net session >nul 2>&1
if errorlevel 1 (
  echo Can chay bang quyen Administrator: chuot phai file nay -^> Run as administrator
  pause
  exit /b 1
)

set "CER=%~dp0MasterScoring-CodeSign.cer"
if not exist "%CER%" (
  echo Khong tim thay %CER%
  pause
  exit /b 1
)

certutil -addstore -f Root "%CER%" || goto :fail
certutil -addstore -f TrustedPublisher "%CER%" || goto :fail
echo.
echo Da cai chung chi Master Scoring thanh cong.
pause
exit /b 0

:fail
echo Cai chung chi that bai.
pause
exit /b 1
