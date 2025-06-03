var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express3 from "express";

// server/routes.ts
import express from "express";
import { createServer } from "http";

// server/storage.ts
import session2 from "express-session";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  insertNotificationSchema: () => insertNotificationSchema,
  insertOrderSchema: () => insertOrderSchema,
  insertPaymentDetailsSchema: () => insertPaymentDetailsSchema,
  insertProductSchema: () => insertProductSchema,
  insertReviewSchema: () => insertReviewSchema,
  insertUserSchema: () => insertUserSchema,
  notifications: () => notifications,
  orders: () => orders,
  paymentDetails: () => paymentDetails,
  products: () => products,
  reviews: () => reviews,
  users: () => users
});
import { pgTable, text, serial, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  socialType: text("social_type"),
  isAdmin: boolean("is_admin").default(false),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).omit({
  id: true,
  isAdmin: true,
  balance: true,
  createdAt: true
});
var products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  images: text("images").array().notNull(),
  quantity: integer("quantity").notNull().default(0),
  category: text("category").notNull(),
  isAvailable: boolean("is_available").default(true),
  isPreorder: boolean("is_preorder").default(false),
  isRare: boolean("is_rare").default(false),
  isEasyToCare: boolean("is_easy_to_care").default(false),
  labels: text("labels").array(),
  deliveryCost: decimal("delivery_cost", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true
});
var orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  items: jsonb("items").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  deliveryAmount: decimal("delivery_amount", { precision: 10, scale: 2 }).notNull(),
  fullName: text("full_name").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  socialNetwork: text("social_network"),
  socialUsername: text("social_username"),
  deliveryType: text("delivery_type").notNull(),
  deliverySpeed: text("delivery_speed").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").default("pending"),
  orderStatus: text("order_status").default("pending"),
  needStorage: boolean("need_storage").default(false),
  needInsulation: boolean("need_insulation").default(false),
  paymentProofUrl: text("payment_proof_url"),
  adminComment: text("admin_comment"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  paymentStatus: true,
  orderStatus: true,
  adminComment: true,
  createdAt: true,
  updatedAt: true
});
var reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  productId: integer("product_id"),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  images: text("images").array(),
  isApproved: boolean("is_approved").default(false),
  createdAt: timestamp("created_at").defaultNow()
});
var insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  isApproved: true,
  createdAt: true
});
var notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  productId: integer("product_id"),
  type: text("type").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow()
});
var insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true
});
var paymentDetails = pgTable("payment_details", {
  id: serial("id").primaryKey(),
  bankDetails: text("bank_details").notNull(),
  qrCodeUrl: text("qr_code_url"),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertPaymentDetailsSchema = createInsertSchema(paymentDetails).omit({
  id: true,
  updatedAt: true
});

// server/storage-db.ts
import connectPg from "connect-pg-simple";
import session from "express-session";

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage-db.ts
import { eq, and, between, gte, lte, desc, sql } from "drizzle-orm";
var PostgresSessionStore = connectPg(session);
var DatabaseStorage = class {
  sessionStore;
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }
  // User operations
  async getUser(id) {
    try {
      const user = await db.queryOne("SELECT * FROM users WHERE id = ?", [id]);
      return transformToUser(user);
    } catch (e) {
      console.error("Error getting user:", e);
      return void 0;
    }
  }
  async getUserById(id) {
    try {
      const user = await db.queryOne("SELECT * FROM users WHERE id = ?", [id]);
      return transformToUser(user);
    } catch (e) {
      console.error("Error getting user by ID:", e);
      return void 0;
    }
  }
  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  async getAllUsers() {
    return db.select().from(users);
  }
  async createUser(user) {
    const [createdUser] = await db.insert(users).values(user).returning();
    return createdUser;
  }
  async updateUser(id, userData) {
    const [updatedUser] = await db.update(users).set({ ...userData, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
    return updatedUser;
  }
  // Product operations
  async getProduct(id) {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }
  async getAllProducts(filters) {
    const conditions = [];
    if (filters) {
      if (filters.category) {
        conditions.push(eq(products.category, filters.category));
      }
      if (filters.available === true) {
        conditions.push(eq(products.isAvailable, true));
      }
      if (filters.preorder === true) {
        conditions.push(eq(products.isPreorder, true));
      }
      if (filters.rare === true) {
        conditions.push(eq(products.isRare, true));
      }
      if (filters.easy === true) {
        conditions.push(eq(products.isEasyToCare, true));
      }
      if (filters.search) {
        conditions.push(
          sql`(${products.name} ILIKE ${"%" + filters.search + "%"} OR ${products.description} ILIKE ${"%" + filters.search + "%"})`
        );
      }
      if (filters.minPrice !== void 0 && filters.maxPrice !== void 0) {
        conditions.push(between(products.price, filters.minPrice, filters.maxPrice));
      } else if (filters.minPrice !== void 0) {
        conditions.push(gte(products.price, filters.minPrice));
      } else if (filters.maxPrice !== void 0) {
        conditions.push(lte(products.price, filters.maxPrice));
      }
      if (filters.labels && filters.labels.length > 0) {
        const labelConditions = filters.labels.map(
          (label) => sql`${products.labels} @> ARRAY[${label}]::text[]`
        );
        conditions.push(sql`(${labelConditions.join(" OR ")})`);
      }
    }
    if (conditions.length > 0) {
      return db.select().from(products).where(and(...conditions));
    }
    return db.select().from(products);
  }
  async createProduct(product) {
    const [createdProduct] = await db.insert(products).values(product).returning();
    return createdProduct;
  }
  async updateProduct(id, productData) {
    const [updatedProduct] = await db.update(products).set({ ...productData, updatedAt: /* @__PURE__ */ new Date() }).where(eq(products.id, id)).returning();
    return updatedProduct;
  }
  async deleteProduct(id) {
    const result = await db.delete(products).where(eq(products.id, id));
    return result.rowCount > 0;
  }
  // Order operations
  async getOrder(id) {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }
  async getOrdersByUser(userId) {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }
  async getAllOrders() {
    return db.select().from(orders).orderBy(desc(orders.createdAt));
  }
  async createOrder(order) {
    const [createdOrder] = await db.insert(orders).values(order).returning();
    return createdOrder;
  }
  async updateOrder(id, orderData) {
    const [updatedOrder] = await db.update(orders).set({ ...orderData, updatedAt: /* @__PURE__ */ new Date() }).where(eq(orders.id, id)).returning();
    return updatedOrder;
  }
  // Review operations
  async getReview(id) {
    const [review] = await db.select().from(reviews).where(eq(reviews.id, id));
    return review;
  }
  async getReviewsByProduct(productId) {
    return db.select().from(reviews).where(eq(reviews.productId, productId)).orderBy(desc(reviews.createdAt));
  }
  async getReviewsByUser(userId) {
    return db.select().from(reviews).where(eq(reviews.userId, userId)).orderBy(desc(reviews.createdAt));
  }
  async getAllReviews(approved) {
    if (approved !== void 0) {
      return db.select().from(reviews).where(eq(reviews.isApproved, approved)).orderBy(desc(reviews.createdAt));
    }
    return db.select().from(reviews).orderBy(desc(reviews.createdAt));
  }
  async createReview(review) {
    const [createdReview] = await db.insert(reviews).values(review).returning();
    return createdReview;
  }
  async updateReview(id, reviewData) {
    const [updatedReview] = await db.update(reviews).set(reviewData).where(eq(reviews.id, id)).returning();
    return updatedReview;
  }
  async deleteReview(id) {
    const result = await db.delete(reviews).where(eq(reviews.id, id));
    return result.rowCount > 0;
  }
  // Notification operations
  async getNotification(id) {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification;
  }
  async getNotificationsByUser(userId) {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }
  async getNotificationsByProduct(productId) {
    return db.select().from(notifications).where(eq(notifications.productId, productId)).orderBy(desc(notifications.createdAt));
  }
  async createNotification(notification) {
    const [createdNotification] = await db.insert(notifications).values(notification).returning();
    return createdNotification;
  }
  async updateNotification(id, notificationData) {
    const [updatedNotification] = await db.update(notifications).set(notificationData).where(eq(notifications.id, id)).returning();
    return updatedNotification;
  }
  async deleteNotification(id) {
    const result = await db.delete(notifications).where(eq(notifications.id, id));
    return result.rowCount > 0;
  }
  // Payment details operations
  async getPaymentDetails() {
    const [details] = await db.select().from(paymentDetails);
    return details;
  }
  async updatePaymentDetails(details) {
    await db.delete(paymentDetails);
    const [updatedDetails] = await db.insert(paymentDetails).values(details).returning();
    return updatedDetails;
  }
};

// server/storage.ts
var storage = new DatabaseStorage();

// server/auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session3 from "express-session";
import crypto2 from "crypto";
import util from "util";
var pbkdf2Async = util.promisify(crypto2.pbkdf2);
async function hashPassword2(password2) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const hash = await pbkdf2Async(password2, salt, 1e3, 64, "sha512");
  return `${salt}:${hash.toString("hex")}`;
}
async function comparePasswords2(plain2, hashed2) {
  const [salt, hash] = hashed2.split(":");
  const derivedHash = await pbkdf2Async(plain2, salt, 1e3, 64, "sha512");
  return hash === derivedHash.toString("hex");
}
var storage2;
function initAuth(db4) {
  const mapDbUser2 = (dbUser) => ({
    id: dbUser.id,
    username: dbUser.username,
    email: dbUser.email,
    password: dbUser.password,
    firstName: dbUser.first_name,
    lastName: dbUser.last_name,
    isAdmin: dbUser.is_admin === 1
  });
  storage2 = {
    async getUserByUsername(username) {
      const user = db4.prepare("SELECT * FROM users WHERE username = ?").get(username);
      return user ? mapDbUser2(user) : null;
    },
    async getUserByEmail(email) {
      const user = db4.prepare("SELECT * FROM users WHERE email = ?").get(email);
      return user ? mapDbUser2(user) : null;
    },
    async getUser(id) {
      const user = db4.prepare("SELECT * FROM users WHERE id = ?").get(id);
      return user ? mapDbUser2(user) : null;
    },
    async createUser(userData) {
      const { username, email, password: password2, firstName, lastName } = userData;
      const hashedPassword = await hashPassword2(password2);
      const result = db4.prepare(`
        INSERT INTO users (username, email, password, first_name, last_name, is_admin)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(username, email, hashedPassword, firstName, lastName, 0);
      return mapDbUser2(db4.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid));
    }
  };
  return storage2;
}
function setupAuth(app2) {
  if (!storage2) {
    throw new Error("Auth storage not initialized. Call initAuth() first.");
  }
  app2.use(session3({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1e3
      // 1 неделя
    }
  }));
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.use(new LocalStrategy(
    { usernameField: "username" },
    async (username, password2, done) => {
      try {
        const user = await storage2.getUserByUsername(username) || await storage2.getUserByEmail(username);
        if (!user || !await comparePasswords2(password2, user.password)) {
          return done(null, false, { message: "Invalid credentials" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await storage2.getUser(id);
      done(null, user ?? false);
    } catch (error) {
      done(error);
    }
  });
  const withoutPassword = (user) => {
    const { password: password2, ...rest } = user;
    return rest;
  };
  app2.post("/api/register", async (req, res, next) => {
    try {
      const { username, email, password: password2, firstName, lastName } = req.body;
      if (await storage2.getUserByUsername(username)) {
        return res.status(400).json({ message: "Username already taken" });
      }
      if (await storage2.getUserByEmail(email)) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const user = await storage2.createUser({ username, email, password: password2, firstName, lastName, isAdmin: false });
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(withoutPassword(user));
      });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });
      req.login(user, (err2) => {
        if (err2) return next(err2);
        req.session.save(() => res.json(withoutPassword(user)));
      });
    })(req, res, next);
  });
  app2.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(withoutPassword(req.user));
  });
}

// server/routes.ts
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";

// server/db-sqlite.ts
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import Database from "better-sqlite3";

// server/auth-utils.ts
import crypto3 from "crypto";
var hashPassword3 = (password2) => {
  const salt = crypto3.randomBytes(16).toString("hex");
  const hash = crypto3.pbkdf2Sync(password2, salt, 1e3, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
};

// server/db-sqlite.ts
var dbDir = join(process.cwd(), "db");
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}
var dbPath = join(dbDir, "database.sqlite");
var sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
var db2 = {
  // Ваши существующие методы
  query: (sql2, params = []) => sqlite.prepare(sql2).all(params),
  queryOne: (sql2, params = []) => sqlite.prepare(sql2).get(params),
  insert: (sql2, params = []) => sqlite.prepare(sql2).run(params).lastInsertRowid,
  update: (sql2, params = []) => sqlite.prepare(sql2).run(params).changes,
  run: (sql2, params = []) => sqlite.prepare(sql2).run(params),
  delete: (sql2, params = []) => sqlite.prepare(sql2).run(params).changes,
  exec: (sql2) => sqlite.exec(sql2),
  // Новые методы для работы с пользователями
  getUserById: (id) => {
    const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return user ? mapDbUser(user) : null;
  },
  getUserByEmail: (email) => {
    const user = sqlite.prepare("SELECT * FROM users WHERE email = ?").get(email);
    return user ? mapDbUser(user) : null;
  },
  createUser: (userData) => {
    const id = crypto.randomUUID();
    sqlite.prepare(`
      INSERT INTO users (id, email, password, first_name, last_name, is_admin)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userData.email.toLowerCase(),
      hashPassword3(userData.password),
      userData.firstName,
      userData.lastName,
      userData.isAdmin ? 1 : 0
    );
    return db2.getUserById(id);
  }
};
function mapDbUser(dbUser) {
  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.first_name,
    lastName: dbUser.last_name,
    isAdmin: dbUser.is_admin === 1,
    password: dbUser.password
  };
}
db2.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// server/routes.ts
await storage.comparePasswords(plain, hashed);
await storage.hashPassword(password);
var fileStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
var upload = multer({
  storage: fileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"));
    }
  }
});
async function registerRoutes(app2) {
  setupAuth(app2);
  app2.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app2.get("/api/products", async (req, res) => {
    const { category, available, preorder, search, minPrice, maxPrice, labels } = req.query;
    const filters = {};
    if (category) filters.category = category;
    if (available !== void 0) filters.available = available === "true";
    if (preorder !== void 0) filters.preorder = preorder === "true";
    if (search) filters.search = search;
    if (minPrice) filters.minPrice = parseFloat(minPrice);
    if (maxPrice) filters.maxPrice = parseFloat(maxPrice);
    if (labels) filters.labels = labels.split(",");
    const products2 = await storage.getAllProducts(filters);
    res.json(products2);
  });
  app2.get("/api/products/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const product = await storage.getProduct(id);
    if (!product) {
      return res.status(404).json({ message: "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    res.json(product);
  });
  app2.post("/api/products", ensureAdmin, async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", errors: error.errors });
      }
      throw error;
    }
  });
  app2.put("/api/products/:id", ensureAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const productData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(id, productData);
      if (!product) {
        return res.status(404).json({ message: "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
      }
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", errors: error.errors });
      }
      throw error;
    }
  });
  app2.delete("/api/products/:id", ensureAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const success = await storage.deleteProduct(id);
    if (!success) {
      return res.status(404).json({ message: "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    res.status(204).end();
  });
  app2.get("/api/orders", ensureAuthenticated, async (req, res) => {
    if (req.user.isAdmin) {
      const orders3 = await storage.getAllOrders();
      return res.json(orders3);
    }
    const orders2 = await storage.getOrdersByUser(req.user.id);
    res.json(orders2);
  });
  app2.get("/api/user/orders", ensureAuthenticated, async (req, res) => {
    try {
      const orders2 = await storage.getOrdersByUser(req.user.id);
      res.json(orders2);
    } catch (error) {
      console.error("Error fetching user orders:", error);
      res.status(500).json({ message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0437\u0430\u043A\u0430\u0437\u044B" });
    }
  });
  app2.get("/api/orders/:id", ensureAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const order = await storage.getOrder(id);
    if (!order) {
      return res.status(404).json({ message: "\u0417\u0430\u043A\u0430\u0437 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    if (!req.user.isAdmin && order.userId !== req.user.id) {
      return res.status(403).json({ message: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D" });
    }
    res.json(order);
  });
  app2.post("/api/orders", ensureAuthenticated, async (req, res) => {
    try {
      const orderData = insertOrderSchema.parse(req.body);
      const user = req.user;
      if (orderData.userId !== user.id) {
        return res.status(403).json({ message: "\u041D\u0435\u043B\u044C\u0437\u044F \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043A\u0430\u0437 \u043E\u0442 \u0438\u043C\u0435\u043D\u0438 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" });
      }
      const updatedOrderData = {
        ...orderData,
        paymentStatus: orderData.paymentMethod === "balance" ? "completed" : "pending",
        orderStatus: orderData.paymentMethod === "balance" ? "processing" : "pending"
      };
      if (orderData.paymentMethod === "balance") {
        try {
          const dbUser = await db2.queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
          const userBalance = dbUser && dbUser.balance ? parseFloat(dbUser.balance) : 0;
          const orderTotal = parseFloat(orderData.totalAmount);
          if (userBalance < orderTotal) {
            return res.status(400).json({
              message: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0441\u0440\u0435\u0434\u0441\u0442\u0432 \u043D\u0430 \u0431\u0430\u043B\u0430\u043D\u0441\u0435",
              requiredAmount: orderTotal,
              availableBalance: userBalance
            });
          }
          const newBalance = (userBalance - orderTotal).toFixed(2);
          await db2.run(
            "UPDATE users SET balance = ?, updated_at = ? WHERE id = ?",
            [newBalance, (/* @__PURE__ */ new Date()).toISOString(), user.id]
          );
          user.balance = newBalance;
          console.log(`\u0411\u0430\u043B\u0430\u043D\u0441 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F ${user.id} \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D: ${userBalance} -> ${newBalance}`);
        } catch (error) {
          console.error("\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435/\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438 \u0431\u0430\u043B\u0430\u043D\u0441\u0430:", error);
          return res.status(500).json({
            message: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 \u043F\u043B\u0430\u0442\u0435\u0436\u0430. \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435."
          });
        }
      }
      const createdOrder = await storage.createOrder(updatedOrderData);
      res.json(createdOrder);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(400).json({
        message: "Failed to create order",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app2.put("/api/orders/:id", ensureAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const order = await storage.getOrder(id);
    if (!order) {
      return res.status(404).json({ message: "\u0417\u0430\u043A\u0430\u0437 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    if (!req.user.isAdmin) {
      if (order.userId !== req.user.id) {
        return res.status(403).json({ message: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D" });
      }
      if (order.orderStatus === "shipped") {
        return res.status(400).json({ message: "\u041D\u0435\u043B\u044C\u0437\u044F \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u043A\u0430\u0437 \u043F\u043E\u0441\u043B\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438" });
      }
      const allowedFields = ["fullName", "address", "phone", "needStorage", "needInsulation"];
      const updatedData = {};
      for (const field of allowedFields) {
        if (field in req.body) {
          updatedData[field] = req.body[field];
        }
      }
      const updatedOrder = await storage.updateOrder(id, updatedData);
      return res.json(updatedOrder);
    }
    try {
      const updatedOrder = await storage.updateOrder(id, req.body);
      res.json(updatedOrder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", errors: error.errors });
      }
      throw error;
    }
  });
  app2.post("/api/orders/:id/payment-proof", ensureAuthenticated, upload.single("proof"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "\u0424\u0430\u0439\u043B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    const id = parseInt(req.params.id);
    const order = await storage.getOrder(id);
    if (!order) {
      return res.status(404).json({ message: "\u0417\u0430\u043A\u0430\u0437 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    if (!req.user.isAdmin && order.userId !== req.user.id) {
      return res.status(403).json({ message: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D" });
    }
    const filePath = `/uploads/${req.file.filename}`;
    const updatedOrder = await storage.updateOrder(id, {
      paymentProofUrl: filePath,
      paymentStatus: "pending_verification"
    });
    res.json(updatedOrder);
  });
  app2.get("/api/reviews", async (req, res) => {
    const { approved, productId } = req.query;
    if (productId) {
      const reviews3 = await storage.getReviewsByProduct(parseInt(productId));
      return res.json(reviews3);
    }
    if (approved !== void 0 && (!req.isAuthenticated() || !req.user?.isAdmin)) {
      const reviews3 = await storage.getAllReviews(true);
      return res.json(reviews3);
    }
    const reviews2 = await storage.getAllReviews(approved === "true");
    res.json(reviews2);
  });
  app2.post("/api/reviews", ensureAuthenticated, async (req, res) => {
    try {
      const reviewData = insertReviewSchema.parse(req.body);
      if (reviewData.userId !== req.user.id) {
        return res.status(403).json({ message: "\u041D\u0435\u043B\u044C\u0437\u044F \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043E\u0442\u0437\u044B\u0432 \u043E\u0442 \u0438\u043C\u0435\u043D\u0438 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" });
      }
      const review = await storage.createReview(reviewData);
      res.status(201).json(review);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", errors: error.errors });
      }
      throw error;
    }
  });
  app2.put("/api/reviews/:id", ensureAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const updatedReview = await storage.updateReview(id, req.body);
      if (!updatedReview) {
        return res.status(404).json({ message: "\u041E\u0442\u0437\u044B\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
      }
      res.json(updatedReview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", errors: error.errors });
      }
      throw error;
    }
  });
  app2.delete("/api/reviews/:id", ensureAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const success = await storage.deleteReview(id);
    if (!success) {
      return res.status(404).json({ message: "\u041E\u0442\u0437\u044B\u0432 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    res.status(204).end();
  });
  app2.get("/api/user/reviews", ensureAuthenticated, async (req, res) => {
    try {
      const reviews2 = await storage.getReviewsByUser(req.user.id);
      res.json(reviews2);
    } catch (error) {
      console.error("Error fetching user reviews:", error);
      res.status(500).json({ message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043E\u0442\u0437\u044B\u0432\u044B" });
    }
  });
  app2.get("/api/notifications", ensureAuthenticated, async (req, res) => {
    const notifications2 = await storage.getNotificationsByUser(req.user.id);
    res.json(notifications2);
  });
  app2.get("/api/user/notifications", ensureAuthenticated, async (req, res) => {
    try {
      const notifications2 = await storage.getNotificationsByUser(req.user.id);
      res.json(notifications2);
    } catch (error) {
      console.error("Error fetching user notifications:", error);
      res.status(500).json({ message: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F" });
    }
  });
  app2.post("/api/notifications", ensureAuthenticated, async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      if (notificationData.userId !== req.user.id) {
        return res.status(403).json({ message: "\u041D\u0435\u043B\u044C\u0437\u044F \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E\u0442 \u0438\u043C\u0435\u043D\u0438 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" });
      }
      const notification = await storage.createNotification(notificationData);
      res.status(201).json(notification);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", errors: error.errors });
      }
      throw error;
    }
  });
  app2.delete("/api/notifications/:id", ensureAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const notification = await storage.getNotification(id);
    if (!notification) {
      return res.status(404).json({ message: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" });
    }
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ message: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D" });
    }
    const success = await storage.deleteNotification(id);
    if (!success) {
      return res.status(404).json({ message: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" });
    }
    res.status(204).end();
  });
  app2.get("/api/payment-details", async (req, res) => {
    const paymentDetails2 = await storage.getPaymentDetails();
    if (!paymentDetails2) {
      return res.status(404).json({ message: "\u0420\u0435\u043A\u0432\u0438\u0437\u0438\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" });
    }
    res.json(paymentDetails2);
  });
  app2.put("/api/payment-details", ensureAdmin, async (req, res) => {
    try {
      const paymentDetailsData = insertPaymentDetailsSchema.parse(req.body);
      const paymentDetails2 = await storage.updatePaymentDetails(paymentDetailsData);
      res.json(paymentDetails2);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435", errors: error.errors });
      }
      throw error;
    }
  });
  app2.get("/api/users", ensureAdmin, async (req, res) => {
    const users2 = await storage.getAllUsers();
    const safeUsers = users2.map(({ password: password2, ...user }) => user);
    res.json(safeUsers);
  });
  app2.put("/api/users/:id", ensureAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!req.user.isAdmin && id !== req.user.id) {
      return res.status(403).json({ message: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D" });
    }
    if (!req.user.isAdmin && req.body.isAdmin !== void 0) {
      return res.status(403).json({ message: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D" });
    }
    if (!req.user.isAdmin && req.body.balance !== void 0) {
      return res.status(403).json({ message: "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D" });
    }
    if (req.body.password && !req.user.isAdmin) {
      if (!req.body.oldPassword) {
        return res.status(400).json({ message: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C" });
      }
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
      }
      const isValid = await comparePasswords(req.body.oldPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ message: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0442\u0435\u043A\u0443\u0449\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C" });
      }
      req.body.password = await hashPassword(req.body.password);
    }
    const updatedUser = await storage.updateUser(id, req.body);
    if (!updatedUser) {
      return res.status(404).json({ message: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
    }
    const { password: password2, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  });
  app2.post("/api/users/:id/add-balance", ensureAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { amount } = req.body;
      if (isNaN(userId)) {
        return res.status(400).json({ message: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" });
      }
      if (typeof amount !== "string" || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u0434\u043B\u044F \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" });
      }
      const currentBalance = user.balance ? parseFloat(user.balance) : 0;
      const newBalance = (currentBalance + parseFloat(amount)).toString();
      const updatedUser = await storage.updateUser(userId, { balance: newBalance });
      const { password: password2, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}
function ensureAuthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F" });
  }
  next();
}
function ensureAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F" });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "\u0422\u0440\u0435\u0431\u0443\u044E\u0442\u0441\u044F \u043F\u0440\u0430\u0432\u0430 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430" });
  }
  next();
}

// server/vite.ts
import express2 from "express";
import fs2 from "fs";
import path3 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  base: "/",
  plugins: [
    react({
      jsxImportSource: "@emotion/react",
      babel: {
        plugins: ["@emotion/babel-plugin"]
      }
    }),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path2.resolve(import.meta.dirname, "client", "src"),
      "@shared": path2.resolve(import.meta.dirname, "shared"),
      "@assets": path2.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path2.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path2.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        entryFileNames: "assets/[name]-[hash].js"
      }
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path3.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
import Database2 from "better-sqlite3";
import path4 from "path";
import { existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
var dbDir2 = path4.join(process.cwd(), "db");
if (!existsSync2(dbDir2)) {
  mkdirSync2(dbDir2, { recursive: true });
}
var dbPath2 = path4.join(dbDir2, "database.sqlite");
var db3 = new Database2(dbPath2);
db3.pragma("journal_mode = WAL");
db3.pragma("foreign_keys = ON");
db3.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
var app = express3();
app.use(express3.json());
app.use(express3.urlencoded({ extended: false }));
initAuth(db3);
setupAuth(app);
app.use((req, res, next) => {
  const start = Date.now();
  const path5 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path5.startsWith("/api")) {
      let logLine = `${req.method} ${path5} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error(err);
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`Server running on port ${port}`);
    log(`Environment: ${app.get("env")}`);
    log(`Database: ${dbPath2}`);
  });
})();
