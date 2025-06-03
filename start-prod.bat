@echo off
chcp 65001 > nul
set TITLE=Russkii Portal Продакшн (SQLite)
title %TITLE%

echo ===== Russkii Portal Продакшн с SQLite =====
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

echo Сборка проекта с SQLite...
call npm run build:sqlite
if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось собрать проект.
    pause
    exit /b
)

echo Проект успешно собран!
echo.
echo Запуск приложения с SQLite (режим продакшн)...
echo.
echo Приложение будет доступно по адресу: http://localhost:5000
echo Нажмите Ctrl+C для остановки сервера
echo.

set NODE_ENV=production
call node dist/index.js

pause 