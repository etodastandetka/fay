import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

console.log('Запуск скрипта для создания администратора...');

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Функция для хеширования паролей (копия из auth-sqlite.ts)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

// Создаем подключение к базе данных
const dbDir = path.join(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
console.log(`База данных SQLite: ${dbPath}`);

const sqlite = new Database(dbPath);

// Включаем внешние ключи
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Удаляем существующего администратора (если есть)
try {
  sqlite.prepare("DELETE FROM users WHERE email = ?").run(["fortnite08qwer@gmail.com"]);
  console.log('Существующий пользователь был удален для создания нового');
} catch (error) {
  console.log('Не удалось удалить пользователя (возможно, его не было)');
}

// Создаем администратора
try {
  // Проверяем и создаем таблицу пользователей, если она не существует
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      first_name TEXT,
      last_name TEXT,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Создаем нового администратора
  const userId = crypto.randomUUID();
  const password = "Plmokn09";
  const hashedPassword = hashPassword(password);
  
  const stmt = sqlite.prepare(
    "INSERT INTO users (id, email, password, first_name, last_name, is_admin) VALUES (?, ?, ?, ?, ?, ?)"
  );
  
  stmt.run([userId, "fortnite08qwer@gmail.com", hashedPassword, "Admin", "User", 1]);
  
  console.log('Администратор успешно создан:');
  console.log('Email: fortnite08qwer@gmail.com');
  console.log('Пароль: Plmokn09');
  
  // Проверяем, что пользователь был создан
  const user = sqlite.prepare("SELECT * FROM users WHERE email = ?").get(["fortnite08qwer@gmail.com"]);
  
  if (user) {
    console.log('Проверка: пользователь найден в базе данных');
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Is Admin: ${Boolean(user.is_admin)}`);
  } else {
    console.log('Ошибка: пользователь не найден в базе после создания');
  }
  
} catch (error) {
  console.error('Ошибка при создании администратора:', error);
}

console.log('Скрипт завершен!'); 