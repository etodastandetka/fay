import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

console.log('Запуск скрипта обновления структуры базы данных...');

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

// Создаем простой API для работы с базой данных
const db = {
  query: (sql, params = []) => {
    return sqlite.prepare(sql).all(params);
  },
  
  exec: (sql) => {
    return sqlite.exec(sql);
  }
};

// Функция для добавления столбца, если он не существует
function addColumnIfNotExists(table, column, type) {
  try {
    const tableInfo = db.query(`PRAGMA table_info(${table})`);
    const columnExists = tableInfo.some(col => col.name === column);
    
    if (!columnExists) {
      console.log(`Добавление столбца ${column} в таблицу ${table}`);
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Ошибка при добавлении столбца ${column}:`, error);
    return false;
  }
}

try {
  // Проверяем наличие таблицы products
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'");
  console.log(`Таблицы в базе данных: ${tables.map(t => t.name).join(', ')}`);
  
  // Проверяем и создаем таблицу orders, если она не существует
  if (!tables.some(t => t.name === 'orders')) {
    console.log('Создание таблицы orders...');
    db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        items TEXT NOT NULL,
        total_amount TEXT NOT NULL,
        delivery_amount TEXT,
        full_name TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        social_network TEXT,
        social_username TEXT,
        comment TEXT,
        need_storage INTEGER DEFAULT 0,
        need_insulation INTEGER DEFAULT 0,
        delivery_type TEXT NOT NULL,
        delivery_speed TEXT,
        payment_method TEXT NOT NULL,
        payment_status TEXT DEFAULT 'pending',
        order_status TEXT DEFAULT 'pending',
        payment_proof_url TEXT,
        admin_comment TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    console.log('Таблица orders создана');
  } else {
    console.log('Таблица orders уже существует, проверяем наличие всех столбцов...');
    
    // Добавляем недостающие столбцы в таблицу orders
    const ordersColumnsToAdd = [
      { name: 'need_storage', type: 'INTEGER DEFAULT 0' },
      { name: 'need_insulation', type: 'INTEGER DEFAULT 0' },
      { name: 'delivery_speed', type: 'TEXT' },
      { name: 'comment', type: 'TEXT' }
    ];
    
    let ordersColumnsAdded = 0;
    
    ordersColumnsToAdd.forEach(col => {
      const added = addColumnIfNotExists('orders', col.name, col.type);
      if (added) ordersColumnsAdded++;
    });
    
    console.log(`Добавлено ${ordersColumnsAdded} новых столбцов в таблицу orders`);
  }
  
  // Проверяем и создаем таблицу products, если она не существует
  if (!tables.some(t => t.name === 'products')) {
    console.log('Создание таблицы products...');
    db.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        original_price REAL,
        images TEXT,
        quantity INTEGER DEFAULT 0,
        category TEXT,
        is_available INTEGER DEFAULT 1,
        is_preorder INTEGER DEFAULT 0,
        is_rare INTEGER DEFAULT 0,
        is_easy_to_care INTEGER DEFAULT 0,
        labels TEXT,
        delivery_cost REAL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      )
    `);
    console.log('Таблица products создана');
  } else {
    console.log('Таблица products уже существует, проверяем наличие всех столбцов...');
    
    // Получаем текущую структуру таблицы
    const tableInfo = db.query("PRAGMA table_info(products)");
    console.log('Текущая структура таблицы products:');
    tableInfo.forEach(col => {
      console.log(`  ${col.name} (${col.type}) ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // Добавляем недостающие столбцы
    const columnsToAdd = [
      { name: 'name', type: 'TEXT NOT NULL' },
      { name: 'description', type: 'TEXT' },
      { name: 'price', type: 'REAL NOT NULL' },
      { name: 'original_price', type: 'REAL' },
      { name: 'images', type: 'TEXT' },
      { name: 'quantity', type: 'INTEGER DEFAULT 0' },
      { name: 'category', type: 'TEXT' },
      { name: 'is_available', type: 'INTEGER DEFAULT 1' },
      { name: 'is_preorder', type: 'INTEGER DEFAULT 0' },
      { name: 'is_rare', type: 'INTEGER DEFAULT 0' },
      { name: 'is_easy_to_care', type: 'INTEGER DEFAULT 0' },
      { name: 'labels', type: 'TEXT' },
      { name: 'delivery_cost', type: 'REAL DEFAULT 0' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' }
    ];
    
    let columnsAdded = 0;
    
    columnsToAdd.forEach(col => {
      const added = addColumnIfNotExists('products', col.name, col.type);
      if (added) columnsAdded++;
    });
    
    console.log(`Добавлено ${columnsAdded} новых столбцов в таблицу products`);
  }
  
  // Проверяем таблицу users и добавляем столбцы balance и phone, если они не существуют
  if (tables.some(t => t.name === 'users')) {
    console.log('Проверяем таблицу users на наличие необходимых столбцов...');
    
    const usersColumnsToAdd = [
      { name: 'balance', type: 'TEXT DEFAULT "0"' },
      { name: 'phone', type: 'TEXT' },
      { name: 'address', type: 'TEXT' }
    ];
    
    let usersColumnsAdded = 0;
    
    usersColumnsToAdd.forEach(col => {
      const added = addColumnIfNotExists('users', col.name, col.type);
      if (added) usersColumnsAdded++;
    });
    
    console.log(`Добавлено ${usersColumnsAdded} новых столбцов в таблицу users`);
    
    // Выводим структуру таблицы users
    const usersInfo = db.query("PRAGMA table_info(users)");
    console.log('Структура таблицы users:');
    usersInfo.forEach(col => {
      console.log(`  ${col.name} (${col.type}) ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
  } else {
    console.log('Таблица users не найдена');
  }
  
  // Проверяем обновленную структуру таблицы orders
  const updatedOrdersInfo = db.query("PRAGMA table_info(orders)");
  console.log('Обновленная структура таблицы orders:');
  updatedOrdersInfo.forEach(col => {
    console.log(`  ${col.name} (${col.type}) ${col.pk ? 'PRIMARY KEY' : ''}`);
  });
  
} catch (error) {
  console.error('Ошибка при обновлении структуры базы данных:', error);
}

// Обновляем таблицы пользователей и заказов
console.log('Проверка и добавление недостающих столбцов в таблицы...');

// Добавляем столбцы в таблицу orders
try {
  // Проверяем существование столбцов в таблице orders
  const orderColumns = db.query('PRAGMA table_info(orders)');
  const orderColumnNames = orderColumns.map(col => col.name);

  // Добавляем need_storage если его нет
  if (!orderColumnNames.includes('need_storage')) {
    console.log('Добавление столбца need_storage в таблицу orders...');
    db.exec('ALTER TABLE orders ADD COLUMN need_storage INTEGER DEFAULT 0');
  }

  // Добавляем need_insulation если его нет
  if (!orderColumnNames.includes('need_insulation')) {
    console.log('Добавление столбца need_insulation в таблицу orders...');
    db.exec('ALTER TABLE orders ADD COLUMN need_insulation INTEGER DEFAULT 0');
  }

  // Добавляем delivery_speed если его нет
  if (!orderColumnNames.includes('delivery_speed')) {
    console.log('Добавление столбца delivery_speed в таблицу orders...');
    db.exec('ALTER TABLE orders ADD COLUMN delivery_speed TEXT DEFAULT "standard"');
  }

  // Обеспечиваем правильное хранение данных о платеже
  if (!orderColumnNames.includes('payment_proof_url')) {
    console.log('Добавление столбца payment_proof_url в таблицу orders...');
    db.exec('ALTER TABLE orders ADD COLUMN payment_proof_url TEXT');
  }

  console.log('Столбцы в таблице заказов проверены и обновлены.');
} catch (error) {
  console.error('Ошибка при обновлении таблицы orders:', error);
}

// Добавляем столбцы в таблицу users
try {
  // Проверяем существование столбцов в таблице users
  const userColumns = db.query('PRAGMA table_info(users)');
  const userColumnNames = userColumns.map(col => col.name);

  // Добавляем phone если его нет
  if (!userColumnNames.includes('phone')) {
    console.log('Добавление столбца phone в таблицу users...');
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }

  // Добавляем address если его нет
  if (!userColumnNames.includes('address')) {
    console.log('Добавление столбца address в таблицу users...');
    db.exec('ALTER TABLE users ADD COLUMN address TEXT');
  }

  // Добавляем username если его нет
  if (!userColumnNames.includes('username')) {
    console.log('Добавление столбца username в таблицу users...');
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  }

  // Разделяем full_name на first_name и last_name если нужно
  if (userColumnNames.includes('full_name') && 
      (!userColumnNames.includes('first_name') || !userColumnNames.includes('last_name'))) {
    
    console.log('Миграция данных из full_name в first_name/last_name...');
    
    // Добавляем столбцы, если их нет
    if (!userColumnNames.includes('first_name')) {
      db.exec('ALTER TABLE users ADD COLUMN first_name TEXT');
    }
    
    if (!userColumnNames.includes('last_name')) {
      db.exec('ALTER TABLE users ADD COLUMN last_name TEXT');
    }
    
    // Мигрируем данные из full_name
    const usersWithFullName = db.query('SELECT id, full_name FROM users WHERE full_name IS NOT NULL');
    
    for (const user of usersWithFullName) {
      const names = user.full_name.trim().split(' ');
      const firstName = names[0] || '';
      const lastName = names.slice(1).join(' ') || '';
      
      db.run(
        'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
        [firstName, lastName, user.id]
      );
    }
  }

  console.log('Столбцы в таблице пользователей проверены и обновлены.');
} catch (error) {
  console.error('Ошибка при обновлении таблицы users:', error);
}

// Закрываем соединение с базой данных
sqlite.close();

console.log('Скрипт завершен!'); 