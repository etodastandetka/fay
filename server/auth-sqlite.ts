import express, { type Express } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { db } from "./db-sqlite";
import crypto from "crypto";
import { z } from "zod";
import MemoryStore from "memorystore";
import { createServer, type Server } from "http";
import { randomBytes, pbkdf2Sync } from "crypto";

// Используем SQLite вместо Postgres
const Session = MemoryStore(session);

// Define user type to match database structure
type UserRecord = {
  id: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  is_admin: number;
  balance?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

// User type with normalized fields for the application
type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  isAdmin: boolean;
  balance?: string;
  password: string;
  socialType: null;
  createdAt: null;
  phone?: string;
  address?: string;
  username?: string;
};

// Добавляем глобальный кэш админов
const adminCache = new Set<string>();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString('hex');
  const iterations = 10000;
  const keylen = 64;
  const digest = 'sha512';
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
  return `${salt}:${iterations}:${keylen}:${digest}:${hash}`;
}

export function comparePasswords(storedPassword: string, suppliedPassword: string): boolean {
  const [salt, iterations, keylen, digest, storedHash] = storedPassword.split(':');
  const suppliedHash = crypto
    .pbkdf2Sync(suppliedPassword, salt, parseInt(iterations), parseInt(keylen), digest)
    .toString('hex');
  return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(suppliedHash, 'hex'));
}

const registerSchema = z.object({
  email: z.string()
    .email("Введите корректный email")
    .min(5, "Email должен содержать минимум 5 символов")
    .max(100, "Email должен содержать максимум 100 символов")
    .transform(email => email.toLowerCase().trim()),
  password: z.string()
    .min(8, "Пароль должен быть минимум 8 символов")
    .max(100, "Пароль должен содержать максимум 100 символов")
    .regex(/[A-Z]/, "Пароль должен содержать хотя бы одну заглавную букву")
    .regex(/[0-9]/, "Пароль должен содержать хотя бы одну цифру"),
  firstName: z.string()
    .min(2, "Имя должно содержать минимум 2 символа")
    .max(50, "Имя должно содержать максимум 50 символов")
    .regex(/^[a-zA-Zа-яА-ЯёЁ]+$/, "Имя должно содержать только буквы"),
  lastName: z.string()
    .min(2, "Фамилия должна содержать минимум 2 символа")
    .max(50, "Фамилия должна содержать максимум 50 символов")
    .regex(/^[a-zA-Zа-яА-ЯёЁ]+$/, "Фамилия должна содержать только буквы"),
});

const loginSchema = z.object({
  email: z.string()
    .email("Введите корректный email")
    .min(5, "Email должен содержать минимум 5 символов")
    .max(100, "Email должен содержать максимум 100 символов")
    .transform(email => email.toLowerCase().trim()),
  password: z.string()
    .min(1, "Введите пароль")
    .max(100, "Пароль должен содержать максимум 100 символов"),
});

// Расширяем интерфейс Express.User для TypeScript
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      fullName?: string;
      phone?: string;
      address?: string;
      username?: string;
      isAdmin: boolean;
      balance?: string;
      [key: string]: any;
    }
  }
}

// Функция преобразования из записи БД в пользовательский объект для сессии
function userRecordToSessionUser(dbUser: UserRecord): Express.User {
  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.first_name || '',
    lastName: dbUser.last_name || '',
    fullName: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim(),
    phone: dbUser.phone || '',
    address: dbUser.address || '',
    username: dbUser.username || dbUser.email,
    isAdmin: dbUser.is_admin === 1,
    balance: dbUser.balance || '0',
    password: '',
    socialType: null,
    createdAt: null
  };
}

// Настройка аутентификации для Express-приложения
export function setupAuth(app: Express) {
  // Настройка сессии
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "keyboard cat",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24, // 1 day
      },
      store: new Session({
        checkPeriod: 86400000, // Clear expired sessions every 24h
      }),
    }),
  );

  // Инициализация Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Настройка сериализации пользователя для паспорта
  passport.serializeUser((user: any, done) => {
    console.log(`[Auth] Сериализация пользователя ${user.email}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const dbUser = db.queryOne("SELECT * FROM users WHERE id = ?", [id]) as UserRecord | null;
      
      if (!dbUser) {
        console.log(`[Auth] Пользователь с ID ${id} не найден при десериализации`);
        return done(null, null);
      }
      
      // Если пользователь найден, создаем объект пользователя для сессии
      const isAdmin = dbUser.is_admin === 1;
      const user = userRecordToSessionUser(dbUser);
      
      console.log(`[Auth] Десериализация пользователя ${dbUser.email}, админ: ${isAdmin ? "Да" : "Нет"}`);
      
      done(null, user);
    } catch (error) {
      console.error("[Auth] Ошибка десериализации:", error);
      done(error, null);
    }
  });

  // Настройка локальной стратегии
  passport.use(new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
        // Ищем пользователя
        const user = db.queryOne(
          "SELECT * FROM users WHERE email = ?",
          [email.toLowerCase()]
        ) as UserRecord | null;

          if (!user) {
          console.log(`[Auth] Пользователь с email ${email} не найден`);
          return done(null, false);
          }

          // Проверяем пароль
        const isValidPassword = comparePasswords(user.password, password);
        
        if (!isValidPassword) {
          console.log(`[Auth] Неверный пароль для пользователя ${email}`);
          return done(null, false);
        }
        
        console.log(`[Auth] Успешная аутентификация пользователя ${email}`);
        
        // Форматируем пользователя для хранения в сессии
        const sessionUser = userRecordToSessionUser(user);
        
        return done(null, sessionUser);
        } catch (error) {
          return done(error);
        }
    }
  ));

  // Маршруты для аутентификации
  app.post("/api/auth/register", async (req, res) => {
  try {
    // Валидация с преобразованием данных
    const validatedData = registerSchema.parse(req.body);
    const { email, password, firstName, lastName } = validatedData;

    // Проверка существующего пользователя
    const existingUser = db.queryOne("SELECT * FROM users WHERE email = ?", [email]);
    if (existingUser) {
      return res.status(400).json({ 
        message: "Пользователь с таким email уже существует",
        field: "email"
      });
    }

    // Создание пользователя
    const userId = crypto.randomUUID();
    db.insert(
      "INSERT INTO users (id, email, password, first_name, last_name, is_admin) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, email, hashPassword(password), firstName, lastName, 0]
    );

    // Получение созданного пользователя
    const newUser = db.queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRecord;
    if (!newUser) {
      throw new Error("Ошибка при создании пользователя");
    }

    // Форматирование пользователя
    const user = userRecordToSessionUser(newUser);

    // Аутентификация
    req.login(user, (err) => {
      if (err) {
        console.error("Ошибка аутентификации:", err);
        return res.status(500).json({ 
          message: "Ошибка при входе после регистрации" 
        });
      }
      return res.status(201).json({
        message: "Регистрация успешна",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isAdmin: user.isAdmin
        },
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Ошибка валидации",
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
    }
    console.error("Ошибка регистрации:", error);
    return res.status(500).json({ 
      message: "Внутренняя ошибка сервера" 
    });
  }
});

app.post("/api/auth/login", (req, res, next) => {
  try {
    // Предварительная валидация
    loginSchema.parse(req.body);
    
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("Ошибка аутентификации:", err);
        return res.status(500).json({ 
          message: "Ошибка авторизации" 
        });
      }

      if (!user) {
        return res.status(401).json({ 
          message: "Неверный email или пароль",
          field: info?.field || "credentials"
        });
      }

      req.login(user, (err) => {
        if (err) {
          console.error("Ошибка входа:", err);
          return res.status(500).json({ 
            message: "Ошибка при входе в систему" 
          });
        }

        // Обновление данных пользователя
        const userRecord = db.queryOne("SELECT * FROM users WHERE id = ?", [user.id]) as UserRecord;
        const fullUser = userRecordToSessionUser(userRecord);
        Object.assign(user, fullUser);
        
        return res.json({ 
          message: "Вход выполнен успешно", 
          user: {
            id: fullUser.id,
            email: fullUser.email,
            firstName: fullUser.firstName,
            lastName: fullUser.lastName,
            isAdmin: fullUser.isAdmin,
            balance: fullUser.balance
          }
        });
      });
    })(req, res, next);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Ошибка валидации",
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
    }
    console.error("Ошибка входа:", error);
    return res.status(500).json({ 
      message: "Внутренняя ошибка сервера" 
    });
  }
});

  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Не авторизован" });
    }

    // Обновляем данные пользователя в сессии перед отправкой
    updateUserSession(req);

    const user = req.user as any;

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || user.first_name,
        lastName: user.lastName || user.last_name,
        isAdmin: user.isAdmin,
        balance: user.balance || "0"
      },
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Ошибка при выходе из системы" });
      }
      res.json({ message: "Успешный выход" });
    });
  });
}

// После setupAuth, добавляем функцию updateUserSession
export function updateUserSession(req: express.Request) {
  if (req.isAuthenticated() && req.user) {
    const user = req.user as Express.User;
    
    try {
      // Получаем актуальные данные пользователя из БД с явной типизацией
      const dbUser = db.queryOne("SELECT * FROM users WHERE id = ?", [user.id]) as UserRecord | null;
      
      if (dbUser) {
        // Обновляем данные в сессии с проверкой наличия свойств
        const currentBalance = parseFloat(user.balance || "0");
        const newBalance = parseFloat(dbUser.balance || "0");
        
        // Логируем изменение баланса
        if (Math.abs(currentBalance - newBalance) > 0.01) {  // учитываем погрешность при сравнении float
          console.log(`Баланс пользователя ${user.id} обновлен: ${currentBalance} → ${newBalance}`);
        }
        
        // Обновляем все данные пользователя из БД
        Object.assign(user, userRecordToSessionUser(dbUser));
        
        console.log(`Сессия пользователя ${dbUser.email || 'unknown'} обновлена. Админ: ${user.isAdmin}, Баланс: ${user.balance}`);
        return true;
      }
    } catch (error) {
      console.error("Ошибка при обновлении сессии пользователя:", error);
    }
  }
  return false;
}

// После setupAuth, добавляем функцию registerUser
export async function registerUser(userData: {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
  phone?: string;
  address?: string;
}): Promise<any> {
  try {
    // Проверка наличия email
    if (!userData.email) {
      throw new Error('Email обязателен');
    }
    
    // Проверить, существует ли уже пользователь с таким email
    const emailExists = db.queryOne(
      "SELECT * FROM users WHERE email = ?",
      [userData.email.toLowerCase()]
    );
    
    if (emailExists) {
      throw new Error('Пользователь с таким email уже существует');
    }
    
    // Хешируем пароль
    const hashedPassword = hashPassword(userData.password);
    
    // Создаем ID пользователя в формате UUID
    const userId = crypto.randomUUID();
    
    // Разделяем имя и фамилию из fullName
    let firstName = '';
    let lastName = '';
    
    if (userData.fullName) {
      const nameParts = userData.fullName.split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    
    // Создаем запись в базе данных
    db.run(
      `INSERT INTO users (
        id, email, password, username, first_name, last_name, phone, address, balance, is_admin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        userData.email.toLowerCase(),
        hashedPassword,
        userData.username || userData.email.split('@')[0],
        firstName,
        lastName,
        userData.phone || '',
        userData.address || '',
        '0.00',
        0,
        new Date().toISOString()
      ]
    );
    
    // Получаем созданного пользователя
    const newUser = db.queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRecord;
    
    if (!newUser) {
      throw new Error('Ошибка при создании пользователя');
    }
    
    // Форматируем пользователя для ответа в формате, требуемом Express
    const formattedUser: User = {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.first_name || '',
      lastName: newUser.last_name || '',
      fullName: `${newUser.first_name} ${newUser.last_name}`.trim(),
      isAdmin: newUser.is_admin === 1,
      balance: newUser.balance || '0.00',
      password: '',
      socialType: null,
      createdAt: null,
      phone: '',
      address: '',
      username: newUser.email,
    };
    
    console.log(`Успешно зарегистрирован пользователь: ${userData.email}`);
    
    return formattedUser;
  } catch (error) {
    console.error('Ошибка регистрации пользователя:', error);
    throw error;
  }
} 