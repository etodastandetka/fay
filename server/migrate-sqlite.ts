import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Убедимся, что папка для базы данных существует
const dbDir = join(process.cwd(), 'db');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const dbPath = join(dbDir, 'database.sqlite');
console.log(`Migrating SQLite database at: ${dbPath}`);

// Подключение к SQLite базе данных
const sqlite = new Database(dbPath);

// Включаем внешние ключи
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Выполнение миграции (создание таблиц на основе схемы)
try {
  console.log('Initializing SQLite schema...');
  
  // Таблица пользователей
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
  
  // Таблица сессий
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Базовая таблица для товаров
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      original_price REAL,
      images TEXT,
      quantity INTEGER DEFAULT 0,
      category TEXT,
      is_available BOOLEAN DEFAULT TRUE,
      is_preorder BOOLEAN DEFAULT FALSE,
      is_rare BOOLEAN DEFAULT FALSE,
      is_easy_to_care BOOLEAN DEFAULT FALSE,
      labels TEXT,
      delivery_cost REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('SQLite migrations completed successfully');
} catch (error) {
  console.error('Migration failed', error);
  process.exit(1);
} 