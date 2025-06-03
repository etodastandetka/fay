@echo off
chcp 65001 > nul
set TITLE=Russkii Portal с SQLite
title %TITLE%

echo ===== Russkii Portal с SQLite =====
echo Проверка наличия node.js...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден. Пожалуйста, установите Node.js и попробуйте снова.
    pause
    exit /b
)

echo Node.js найден!
echo.
echo Установка зависимостей...
call npm install
if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось установить зависимости.
    pause
    exit /b
)

echo Зависимости установлены!
echo.

REM Создаем директорию uploads если её нет
if not exist "uploads" mkdir uploads

REM Создаем директорию db если её нет
if not exist "db" mkdir db

REM Проверяем, настроен ли администратор
echo Проверка настроек администратора...
if not exist "db\database.sqlite" (
    echo База данных не найдена. Запускаем настройку администратора...
    call setup-admin.bat
    if %errorlevel% neq 0 (
        echo [ОШИБКА] Не удалось настроить администратора.
        pause
        exit /b
    )
)

echo Запуск приложения с SQLite (режим разработки)...
echo.
echo Приложение будет доступно по адресу: http://localhost:5000
echo Для входа в админ-панель используйте:
echo   Email: fortnite08qwer@gmail.com
echo   Пароль: Plmokn09
echo.
echo Нажмите Ctrl+C для остановки сервера
echo.

set NODE_ENV=development
call npx tsx server/index-sqlite.ts

pause 