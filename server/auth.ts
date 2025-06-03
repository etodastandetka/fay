import { Express, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import session from 'express-session';
import { Database } from 'better-sqlite3';
import crypto from 'crypto';
import util from 'util';

// 1. Интерфейс пользователя
interface IUser {
  id: number;
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
}

// 2. Расширяем Express.User
declare global {
  namespace Express {
    interface User extends IUser {}
  }
}

// 3. Функции для работы с паролями
const pbkdf2Async = util.promisify(crypto.pbkdf2);

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await pbkdf2Async(password, salt, 1000, 64, 'sha512');
  return `${salt}:${hash.toString('hex')}`;
}

export async function comparePasswords(plain: string, hashed: string): Promise<boolean> {
  const [salt, hash] = hashed.split(':');
  const derivedHash = await pbkdf2Async(plain, salt, 1000, 64, 'sha512');
  return hash === derivedHash.toString('hex');
}

// 4. Хранилище данных
interface IStorage {
  getUserByUsername(username: string): Promise<IUser | null>;
  getUserByEmail(email: string): Promise<IUser | null>;
  getUser(id: number): Promise<IUser | null>;
  createUser(userData: Omit<IUser, 'id'>): Promise<IUser>;
}

let storage: IStorage;

// 5. Инициализация хранилища
export function initAuth(db: Database): IStorage {
  const mapDbUser = (dbUser: any): IUser => ({
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    password: dbUser.password,
    firstName: dbUser.first_name,
    lastName: dbUser.last_name,
    isAdmin: dbUser.is_admin === 1
  });

  storage = {
    async getUserByUsername(username: string): Promise<IUser | null> {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      return user ? mapDbUser(user) : null;
    },

    async getUserByEmail(email: string): Promise<IUser | null> {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      return user ? mapDbUser(user) : null;
    },

    async getUser(id: number): Promise<IUser | null> {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return user ? mapDbUser(user) : null;
    },

    async createUser(userData: Omit<IUser, 'id'>): Promise<IUser> {
      const { username, email, password, firstName, lastName } = userData;
      const hashedPassword = await hashPassword(password);
      const result = db.prepare(`
        INSERT INTO users (username, email, password, first_name, last_name, is_admin)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(username, email, hashedPassword, firstName, lastName, 0);
      
      return mapDbUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid));
    }
  };

  return storage;
}

// 6. Настройка аутентификации
export function setupAuth(app: Express): void {
  if (!storage) {
    throw new Error('Auth storage not initialized. Call initAuth() first.');
  }

  // Настройка сессии
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 1 неделя
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Стратегия Local
  passport.use(new LocalStrategy(
    { usernameField: 'username' },
    async (username: string, password: string, done) => {
      try {
        const user = await storage.getUserByUsername(username) || await storage.getUserByEmail(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: 'Invalid credentials' });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));

  // Сериализация пользователя
  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  // Десериализация пользователя
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? false);
    } catch (error) {
      done(error);
    }
  });

  // Вспомогательная функция
  const withoutPassword = (user: IUser): Omit<IUser, 'password'> => {
    const { password, ...rest } = user;
    return rest;
  };

  // Роуты аутентификации
  app.post('/api/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, email, password, firstName, lastName } = req.body;

      if (await storage.getUserByUsername(username)) {
        return res.status(400).json({ message: 'Username already taken' });
      }

      if (await storage.getUserByEmail(email)) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const user = await storage.createUser({ username, email, password, firstName, lastName, isAdmin: false });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(withoutPassword(user));
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/login', (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || 'Login failed' });

      req.login(user, (err) => {
        if (err) return next(err);
        req.session.save(() => res.json(withoutPassword(user)));
      });
    })(req, res, next);
  });

  app.post('/api/logout', (req: Request, res: Response, next: NextFunction) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get('/api/user', (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    res.json(withoutPassword(req.user));
  });
}
