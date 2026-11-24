@echo off
chcp 65001 >nul
title VitaBook - Website Ban Sach (Server + Client)
color 0B

echo ============================================================================
echo    DANG KHOI DONG WEBSITE BAN SACH (VITABOOK E-COMMERCE)
echo ============================================================================
echo.

cd /d "%~dp0"

:: Don dep port 5000 va 5173 neu dang bi chiem tu lan chay truoc
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: 1. Kiem tra Database SQL Server
echo [1/3] Kiem tra co so du lieu SQL Server (BookstoreDB)...
sqlcmd -S localhost -E -Q "IF DB_ID('BookstoreDB') IS NULL EXIT 1" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       - Dang tu dong tao Database va du lieu mau tu schema.sql...
    sqlcmd -S localhost -E -f 65001 -i "%~dp0schema.sql" >nul
)
echo       - Database BookstoreDB da san sang!

:: 2. Kiem tra node_modules
if not exist "%~dp0server\node_modules" (
    echo       - Dang cai dat thu vien Backend...
    cd /d "%~dp0server" && call npm install
)
if not exist "%~dp0client\node_modules" (
    echo       - Dang cai dat thu vien Frontend...
    cd /d "%~dp0client" && call npm install
)

:: 3. Khoi chay Backend (ngam) va Frontend + Tu dong mo trinh duyet
echo [2/3] Dang khoi chay Backend API (http://localhost:5000)...
start /B "" cmd /c "cd /d "%~dp0server" && npm start"

ping 127.0.0.1 -n 3 >nul

echo [3/3] Dang khoi chay Frontend UI va mo trinh duyet (http://localhost:5173)...
echo.
echo ============================================================================
echo  WEBSITE DANG CHAY TAI: http://localhost:5173
echo  - Admin Demo     : admin@bookstore.vn     / Mat khau: 123456
echo  - Khach hang Demo: khachhang@bookstore.vn / Mat khau: 123456
echo  (Dong cua so nay hoac nhan Ctrl+C de tat toan bo he thong)
echo ============================================================================
echo.

cd /d "%~dp0client"
call npm run dev
