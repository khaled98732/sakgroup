@echo off
chcp 65001 >nul
title نظام مؤسسة صخر المصري - السيرفر المحلي
echo ========================================================
echo      مؤسسة صخر المصري - تشغيل السيرفر المحلي
echo              الأردن - عمّان (عملة: د.أ)
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [تنبيه] يرجى تثبيت برنامج Node.js أولاً من الموقع الرسمي:
    echo https://nodejs.org
    pause
    exit /b
)

if not exist "node_modules" (
    echo جاري تثبيت مكتبات المشروع لأول مرة، يرجى الانتظار...
    call npm install
)

echo.
echo جاري تشغيل السيرفر المحلي على المنفذ 3000...
echo يمكنك فتح النظام على هذا الجهاز عبر الرابط:
echo http://localhost:3000
echo.
echo وللدخول من هواتف الموظفين المتصلة بنفس شبكة الواي فاي (Wi-Fi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    echo http://%%a:3000
)
echo ========================================================
echo.

call npm run dev
pause
