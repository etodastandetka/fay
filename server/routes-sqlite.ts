import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { db } from "./db-sqlite";
import { setupAuth } from "./auth-sqlite";
import { z } from "zod";
import { insertProductSchema, insertOrderSchema, insertReviewSchema, insertNotificationSchema, insertPaymentDetailsSchema } from "@shared/schema";

// Типизация данных из базы данных
type UserRecord = {
  id: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  address?: string;
  username?: string;
  is_admin: number;
  balance?: string;
  created_at: string;
  updated_at?: string;
};

// Импортируем обновление сессии из auth-sqlite
import { updateUserSession as syncUserSession } from "./auth-sqlite";

// Кэш для администраторов
const adminCache = new Set<string>();

// Функция хэширования пароля (для SQLite реализации)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Функция проверки пароля
function verifyPassword(inputPassword: string, hashedPassword: string): boolean {
  const hashedInput = hashPassword(inputPassword);
  return hashedInput === hashedPassword;
}

// Настройка хранилища для загрузки файлов
const fileStorage = multer.diskStorage({
  destination: function (req: any, file: any, cb: any) {
    const uploadDir = path.join(process.cwd(), "uploads");
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req: any, file: any, cb: any) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: fileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только изображения"));
    }
  },
});

// Middleware для сохранения статуса администратора
function preserveAdminStatus(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated() && req.user) {
    const user = req.user as any;
    const userId = user.id;
    
    // Если пользователь уже в кэше админов
    if (adminCache.has(userId)) {
      console.log(`🔒 Восстановление прав админа для пользователя ${userId}`);
      user.isAdmin = true;
      user.is_admin = 1;
    }
    
    // Если пользователь имеет признак админа, добавляем в кэш
    if (user.isAdmin === true || user.is_admin === 1) {
      console.log(`✅ Кэширование прав админа для пользователя ${userId}`);
      adminCache.add(userId);
    }
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Sets up authentication routes
  setupAuth(app);
  
  // Добавляем middleware для сохранения статуса администратора
  app.use(preserveAdminStatus);
  
  // Serve static uploads
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  
  // Upload image route
  app.post("/api/upload", ensureAdmin, upload.single("image"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Изображение не загружено" });
      }
      
      // Создаем URL к загруженному файлу
      const imageUrl = `/uploads/${req.file.filename}`;
      console.log(`Файл загружен: ${imageUrl}`);
      
      res.json({ 
        message: "Файл успешно загружен", 
        imageUrl: imageUrl,
        file: req.file
      });
    } catch (error) {
      console.error("Ошибка при загрузке файла:", error);
      res.status(500).json({ message: "Ошибка при загрузке файла" });
    }
  });
  
  // Добавляем новый маршрут для прямой загрузки нескольких изображений
  app.post("/api/upload-images", ensureAdmin, upload.array("images", 10), (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "Изображения не загружены" });
      }
      
      // Создаем URL к загруженным файлам
      const imageUrls: string[] = [];
      const files = req.files as Express.Multer.File[];
      
      files.forEach(file => {
        const imageUrl = `/uploads/${file.filename}`;
        imageUrls.push(imageUrl);
        console.log(`Файл загружен: ${imageUrl}`);
      });
      
      res.json({ 
        message: "Файлы успешно загружены", 
        imageUrls: imageUrls
      });
    } catch (error) {
      console.error("Ошибка при загрузке файлов:", error);
      res.status(500).json({ message: "Ошибка при загрузке файлов" });
    }
  });
  
  // Product routes
  app.get("/api/products", async (req, res) => {
    try {
      // Получаем все товары из базы данных
      const rawProducts = db.query("SELECT * FROM products");
      
      // Преобразуем данные из БД в формат, понятный клиенту
      const products = rawProducts.map(product => formatProductForClient(product));
      
      // Apply filters if specified in query params
      let filteredProducts = products.filter(Boolean); // Удаляем null значения
      
      // Filter by category
      if (req.query.category) {
        filteredProducts = filteredProducts.filter(
          product => product && product.category === req.query.category
        );
      }
      
      // Filter by availability
      if (req.query.available === "true") {
        filteredProducts = filteredProducts.filter(
          product => product && product.isAvailable && product.quantity > 0
        );
      }
      
      // Filter by preorder status
      if (req.query.preorder === "true") {
        filteredProducts = filteredProducts.filter(
          product => product && product.isPreorder
        );
      }
      
      // Filter by search term
      if (req.query.search) {
        const searchTerm = (req.query.search as string).toLowerCase();
        filteredProducts = filteredProducts.filter(
          product => 
            product && (
            product.name.toLowerCase().includes(searchTerm) ||
            product.description.toLowerCase().includes(searchTerm)
            )
        );
      }
      
      // Filter by price range
      if (req.query.minPrice) {
        const minPrice = parseFloat(req.query.minPrice as string);
        filteredProducts = filteredProducts.filter(
          product => product && product.price >= minPrice
        );
      }
      
      if (req.query.maxPrice) {
        const maxPrice = parseFloat(req.query.maxPrice as string);
        filteredProducts = filteredProducts.filter(
          product => product && product.price <= maxPrice
        );
      }
      
      res.json(filteredProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });
  
  // Get product by ID
  app.get("/api/products/:id", async (req, res) => {
    try {
      // Проверяем, что ID является числом
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ message: "Некорректный ID товара" });
      }
      
      const product = db.queryOne(
        "SELECT * FROM products WHERE id = ?",
        [productId]
      );
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Преобразуем данные для клиента
      const formattedProduct = formatProductForClient(product);
      
      res.json(formattedProduct);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });
  
  // Create new product
  app.post("/api/products", ensureAdmin, async (req, res) => {
    try {
      console.log("Creating product with data:", req.body);
      
      // Валидируем и трансформируем данные
      const productData = req.body;
      
      // Проверка обязательных полей
      if (!productData.name || !productData.price) {
        return res.status(400).json({ 
          message: "Не указаны обязательные поля: название и цена товара" 
        });
      }
      
      // Изображения должны быть массивом строк
      if (!productData.images) {
        productData.images = [];
      } else if (typeof productData.images === 'string') {
        productData.images = [productData.images];
      }
      
      // Проверяем, что все числовые значения преобразованы в числа
      try {
      productData.price = parseFloat(productData.price);
        if (isNaN(productData.price)) {
          return res.status(400).json({ message: "Некорректное значение цены" });
        }
        
      if (productData.originalPrice) {
        productData.originalPrice = parseFloat(productData.originalPrice);
          if (isNaN(productData.originalPrice)) {
            return res.status(400).json({ message: "Некорректное значение исходной цены" });
          }
        }
        
        productData.quantity = parseInt(productData.quantity || "0");
        if (isNaN(productData.quantity)) {
          return res.status(400).json({ message: "Некорректное значение количества" });
        }
        
      if (productData.deliveryCost) {
        productData.deliveryCost = parseFloat(productData.deliveryCost);
          if (isNaN(productData.deliveryCost)) {
            return res.status(400).json({ message: "Некорректное значение стоимости доставки" });
          }
        }
      } catch (error) {
        console.error("Error parsing numeric values:", error);
        return res.status(400).json({ message: "Ошибка при обработке числовых значений" });
      }
      
      // Добавляем флаги (булевы значения)
      productData.isAvailable = productData.isAvailable === true || productData.isAvailable === 'true';
      productData.isPreorder = productData.isPreorder === true || productData.isPreorder === 'true';
      productData.isRare = productData.isRare === true || productData.isRare === 'true';
      productData.isEasyToCare = productData.isEasyToCare === true || productData.isEasyToCare === 'true';
      
      // Создаем товар
      try {
        // Сначала проверим, что в таблице есть все необходимые столбцы
        try {
          const tableInfo = db.query("PRAGMA table_info(products)");
          const columns = tableInfo.map((col: any) => col.name);
          const requiredColumns = [
            'name', 'description', 'price', 'original_price', 'images', 'quantity', 
            'category', 'is_available', 'is_preorder', 'is_rare', 'is_easy_to_care',
            'labels', 'delivery_cost'
          ];
          
          const missingColumns = requiredColumns.filter(col => !columns.includes(col));
          
          if (missingColumns.length > 0) {
            console.error(`В таблице products отсутствуют столбцы: ${missingColumns.join(', ')}`);
            return res.status(500).json({ 
              message: "Структура базы данных не соответствует требуемой. Выполните команду update-db-schema.bat" 
            });
          }
        } catch (err) {
          console.error("Ошибка при проверке структуры таблицы:", err);
        }
      
      // Создаем товар
      const result = db.insert(
        `INSERT INTO products (
          name, description, price, original_price, 
          images, quantity, category, is_available, 
          is_preorder, is_rare, is_easy_to_care, 
          labels, delivery_cost, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productData.name, 
            productData.description || "", 
          productData.price, 
          productData.originalPrice || null, 
            JSON.stringify(productData.images || []), 
          productData.quantity || 0, 
            productData.category || "", 
          productData.isAvailable ? 1 : 0, 
          productData.isPreorder ? 1 : 0, 
          productData.isRare ? 1 : 0, 
          productData.isEasyToCare ? 1 : 0, 
          JSON.stringify(productData.labels || []), 
          productData.deliveryCost || 0,
          new Date().toISOString()
        ]
      );
      
        console.log("Product created successfully with result:", result);
        
        // Получаем созданный товар по его ID
        try {
          console.log("ID нового товара:", result);
          
          // Проверяем, что result - это число
          if (result === undefined || result === null) {
            console.error("Не удалось получить ID созданного товара");
            return res.status(500).json({ message: "Ошибка при создании товара: не получен ID" });
          }
          
          // Сразу получаем товар по ID
          const newProduct = db.queryOne(
        "SELECT * FROM products WHERE id = ?",
            [result]
          );
          
          if (!newProduct) {
            console.error(`Товар с ID ${result} не найден после создания`);
            
            // Пытаемся получить последний добавленный товар
            const lastProduct = db.queryOne(
              "SELECT * FROM products ORDER BY id DESC LIMIT 1"
            );
            
            if (lastProduct) {
              console.log("Найден последний товар:", lastProduct);
              const formattedProduct = formatProductForClient(lastProduct);
              return res.status(201).json(formattedProduct);
            } else {
              return res.status(500).json({ message: "Товар создан, но не удалось получить данные" });
            }
          }
          
          console.log("Новый товар успешно получен:", newProduct);
          
          // Преобразуем строку JSON в массив для images и labels
          const formattedProduct = formatProductForClient(newProduct);
          
          // Отправляем товар клиенту
          res.status(201).json(formattedProduct);
        } catch (queryError) {
          console.error("Ошибка при получении созданного товара:", queryError);
          return res.status(500).json({ message: "Товар создан, но не удалось получить данные" });
        }
      } catch (dbError) {
        console.error("Database error creating product:", dbError);
        return res.status(500).json({ message: "Ошибка базы данных при создании товара" });
      }
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product", error: String(error) });
    }
  });
  
  // Update product
  app.put("/api/products/:id", ensureAdmin, async (req, res) => {
    try {
      const productId = req.params.id;
      const productData = req.body;
      
      console.log("Обновление товара, полученные данные:", productData);
      
      // Изображения должны быть массивом строк
      if (!productData.images) {
        productData.images = [];
      } else if (typeof productData.images === 'string') {
        productData.images = [productData.images];
      }
      
      console.log("Изображения товара:", productData.images);
      
      // Проверяем существование товара
      const existingProduct = db.query(
        "SELECT * FROM products WHERE id = ?",
        [productId]
      );
      
      if (existingProduct.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Обновляем товар
      db.update(
        `UPDATE products SET
          name = ?,
          description = ?,
          price = ?,
          original_price = ?,
          images = ?,
          quantity = ?,
          category = ?,
          is_available = ?,
          is_preorder = ?,
          is_rare = ?,
          is_easy_to_care = ?,
          labels = ?,
          delivery_cost = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          productData.name, 
          productData.description, 
          parseFloat(productData.price), 
          productData.originalPrice ? parseFloat(productData.originalPrice) : null, 
          JSON.stringify(productData.images), 
          parseInt(productData.quantity) || 0, 
          productData.category, 
          productData.isAvailable === true || productData.isAvailable === 'true' ? 1 : 0, 
          productData.isPreorder === true || productData.isPreorder === 'true' ? 1 : 0, 
          productData.isRare === true || productData.isRare === 'true' ? 1 : 0, 
          productData.isEasyToCare === true || productData.isEasyToCare === 'true' ? 1 : 0, 
          JSON.stringify(productData.labels || []), 
          productData.deliveryCost ? parseFloat(productData.deliveryCost) : 0,
          new Date().toISOString(),
          productId
        ]
      );
      
      try {
      // Получаем обновленный товар
        const updatedProduct = db.queryOne(
        "SELECT * FROM products WHERE id = ?",
        [productId]
        );
        
        if (!updatedProduct) {
          return res.status(404).json({ message: "Товар не найден после обновления" });
        }
        
        console.log("Товар успешно обновлен:", updatedProduct);
        
        // Форматируем товар для клиента
        const formattedProduct = formatProductForClient(updatedProduct);
        
        res.json(formattedProduct);
      } catch (queryError) {
        console.error("Ошибка при получении обновленного товара:", queryError);
        return res.status(500).json({ message: "Товар обновлен, но не удалось получить данные" });
      }
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });
  
  // Delete product
  app.delete("/api/products/:id", ensureAdmin, async (req, res) => {
    try {
      const productId = req.params.id;
      
      // Проверяем, что ID является числом
      if (isNaN(parseInt(productId))) {
        return res.status(400).json({ message: "Некорректный ID товара" });
      }
      
      // Проверяем существование товара
      const existingProduct = db.query(
        "SELECT * FROM products WHERE id = ?",
        [productId]
      );
      
      if (existingProduct.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Удаляем товар
      db.delete(
        "DELETE FROM products WHERE id = ?",
        [productId]
      );
      
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });
  
  // Get unique categories
  app.get("/api/categories", async (req, res) => {
    try {
      const products = db.query("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''");
      const categories = products.map((product: any) => product.category).filter(Boolean);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });
  
  // Маршруты для работы с платежными реквизитами
  app.get("/api/payment-details", async (req, res) => {
    try {
      // Получаем платежные реквизиты (берем только первую запись)
      const paymentDetails = db.queryOne("SELECT * FROM payment_details LIMIT 1") as {
        id: number;
        card_number: string;
        card_holder: string;
        bank_name: string;
        qr_code_url: string;
        instructions: string;
        created_at: string;
        updated_at: string;
      } | null;
      
      if (!paymentDetails) {
        return res.status(404).json({ message: "Платежные реквизиты не найдены" });
      }
      
      // Преобразуем в формат, ожидаемый клиентом
      const formattedDetails = {
        id: paymentDetails.id,
        bankDetails: `Номер карты: ${paymentDetails.card_number}
Получатель: ${paymentDetails.card_holder}
Банк: ${paymentDetails.bank_name}

${paymentDetails.instructions}`,
        qrCodeUrl: paymentDetails.qr_code_url,
        updatedAt: paymentDetails.updated_at
      };
      
      res.json(formattedDetails);
    } catch (error) {
      console.error("Error fetching payment details:", error);
      res.status(500).json({ message: "Failed to fetch payment details" });
    }
  });
  
  // Обновление платежных реквизитов
  app.put("/api/payment-details", ensureAdmin, async (req, res) => {
    try {
      console.log("Обновление платежных реквизитов:", req.body);
      const { bankDetails, cardNumber, cardHolder, bankName, instructions } = req.body;
      
      // Получаем текущие реквизиты
      const paymentDetails = db.queryOne("SELECT * FROM payment_details LIMIT 1") as {
        id: number;
        card_number: string;
        card_holder: string;
        bank_name: string;
        instructions: string;
        qr_code_url: string;
      } | null;
      
      // Если пришли данные в формате bankDetails, парсим их
      let cardNum = cardNumber;
      let holder = cardHolder;
      let bank = bankName;
      let instrText = instructions;
      
      if (bankDetails) {
        // Пытаемся извлечь данные из текстового поля bankDetails
        const lines = bankDetails.split('\n');
        const cardLineMatch = lines.find((l: string) => l.includes('Номер карты:'));
        const holderLineMatch = lines.find((l: string) => l.includes('Получатель:'));
        const bankLineMatch = lines.find((l: string) => l.includes('Банк:'));
        
        if (cardLineMatch) {
          cardNum = cardLineMatch.replace('Номер карты:', '').trim();
        }
        
        if (holderLineMatch) {
          holder = holderLineMatch.replace('Получатель:', '').trim();
        }
        
        if (bankLineMatch) {
          bank = bankLineMatch.replace('Банк:', '').trim();
        }
        
        // Извлекаем инструкции (всё, что после пустой строки)
        const emptyLineIndex = lines.findIndex((l: string) => l.trim() === '');
        if (emptyLineIndex !== -1 && emptyLineIndex < lines.length - 1) {
          instrText = lines.slice(emptyLineIndex + 1).join('\n');
        }
      }
      
      if (!paymentDetails) {
        // Создаем новую запись, если не существует
        console.log("Создание новых платежных реквизитов");
        const result = db.run(`
          INSERT INTO payment_details (
            card_number, card_holder, bank_name, instructions, qr_code_url
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          cardNum || '', 
          holder || '', 
          bank || '', 
          instrText || '',
          '/uploads/default-qr.png'
        ]);
        
        const newDetails = db.queryOne("SELECT * FROM payment_details LIMIT 1") as {
          id: number;
          card_number: string;
          card_holder: string;
          bank_name: string;
          qr_code_url: string;
          instructions: string;
        };

        // Преобразуем в формат, ожидаемый клиентом
        const formattedDetails = {
          id: newDetails.id,
          bankDetails: `Номер карты: ${newDetails.card_number}
Получатель: ${newDetails.card_holder}
Банк: ${newDetails.bank_name}

${newDetails.instructions}`,
          qrCodeUrl: newDetails.qr_code_url,
          updatedAt: new Date().toISOString()
        };
        
        return res.json(formattedDetails);
      }
      
      // Обновляем существующую запись
      console.log("Обновление существующих платежных реквизитов с данными:", {
        cardNum, holder, bank, instrText
      });
      
      const updateResult = db.run(`
        UPDATE payment_details SET 
        card_number = ?, 
        card_holder = ?, 
        bank_name = ?, 
        instructions = ?,
        updated_at = ?
        WHERE id = ?
      `, [
        cardNum || paymentDetails.card_number, 
        holder || paymentDetails.card_holder, 
        bank || paymentDetails.bank_name, 
        instrText || paymentDetails.instructions,
        new Date().toISOString(),
        paymentDetails.id
      ]);
      
      console.log("Обновлено записей:", updateResult.changes);
      
      const updatedDetails = db.queryOne("SELECT * FROM payment_details WHERE id = ?", [paymentDetails.id]) as {
        id: number;
        card_number: string;
        card_holder: string;
        bank_name: string;
        qr_code_url: string;
        instructions: string;
        updated_at: string;
      };
      
      // Преобразуем в формат, ожидаемый клиентом
      const formattedDetails = {
        id: updatedDetails.id,
        bankDetails: `Номер карты: ${updatedDetails.card_number}
Получатель: ${updatedDetails.card_holder}
Банк: ${updatedDetails.bank_name}

${updatedDetails.instructions}`,
        qrCodeUrl: updatedDetails.qr_code_url,
        updatedAt: updatedDetails.updated_at || new Date().toISOString()
      };
      
      res.json(formattedDetails);
    } catch (error) {
      console.error("Error updating payment details:", error);
      res.status(500).json({ message: "Failed to update payment details" });
    }
  });
  
  // Загрузка QR-кода для оплаты
  app.post("/api/upload-qr-code", ensureAdmin, upload.single("qrCode"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "QR-код не загружен" });
      }
      
      // Создаем URL к загруженному QR-коду
      const qrCodeUrl = `/uploads/${req.file.filename}`;
      console.log(`QR-код загружен: ${qrCodeUrl}`);
      
      // Обновляем URL QR-кода в базе данных
      const paymentDetails = db.queryOne("SELECT * FROM payment_details LIMIT 1") as {
        id: number;
      } | null;
      
      if (paymentDetails) {
        db.run(
          "UPDATE payment_details SET qr_code_url = ?, updated_at = ? WHERE id = ?",
          [qrCodeUrl, new Date().toISOString(), paymentDetails.id]
        );
      } else {
        // Создаем новую запись, если не существует
        db.run(`
          INSERT INTO payment_details (
            qr_code_url, card_number, card_holder, bank_name, instructions
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          qrCodeUrl, 
          '', 
          '', 
          '', 
          'Для оплаты отсканируйте QR-код или переведите деньги на указанную карту'
        ]);
      }
      
      res.json({ 
        message: "QR-код успешно загружен", 
        qrCodeUrl: qrCodeUrl
      });
    } catch (error) {
      console.error("Ошибка при загрузке QR-кода:", error);
      res.status(500).json({ message: "Ошибка при загрузке QR-кода" });
    }
  });
  
  // Маршруты для работы с настройками
  app.get("/api/settings", async (req, res) => {
    try {
      // Получаем все настройки
      const settings = db.query("SELECT * FROM settings") as Array<{key: string, value: string}>;
      
      // Преобразуем в объект для удобства использования
      const settingsObj: Record<string, string> = {};
      settings.forEach(setting => {
        settingsObj[setting.key] = setting.value;
      });
      
      res.json(settingsObj);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });
  
  // Обновление настроек
  app.put("/api/settings", ensureAdmin, async (req, res) => {
    try {
      const updates = req.body;
      
      // Обновляем каждую настройку
      for (const [key, value] of Object.entries(updates)) {
        // Проверяем, существует ли настройка
        const existingSetting = db.queryOne("SELECT * FROM settings WHERE key = ?", [key]);
        
        if (existingSetting) {
          // Обновляем существующую настройку
          db.run(
            "UPDATE settings SET value = ?, updated_at = ? WHERE key = ?",
            [value, new Date().toISOString(), key]
          );
        } else {
          // Создаем новую настройку
          db.run(
            "INSERT INTO settings (key, value) VALUES (?, ?)",
            [key, value]
          );
        }
      }
      
      // Получаем обновленные настройки
      const settings = db.query("SELECT * FROM settings") as Array<{key: string, value: string}>;
      
      // Преобразуем в объект для удобства использования
      const settingsObj: Record<string, string> = {};
      settings.forEach(setting => {
        settingsObj[setting.key] = setting.value;
      });
      
      res.json(settingsObj);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });
  
  // Минимальный набор маршрутов для тестирования
  app.get('/api/test', (req, res) => {
    res.json({ message: 'SQLite API is working!' });
  });

  // Добавляем маршруты для работы с отзывами
  app.get("/api/reviews", async (req, res) => {
    try {
      const { productId, approved } = req.query;
      
      if (productId) {
        // Получаем отзывы для конкретного товара (только одобренные для публичного доступа)
        const reviews = db.query(
          "SELECT * FROM reviews WHERE product_id = ? AND is_approved = 1 ORDER BY created_at DESC",
          [productId]
        ) as Array<{
          id: number;
          user_id: string | number;
          product_id: number;
          rating: number;
          text: string;
          is_approved: number;
          created_at: string;
          images: string;
        }>;
        
        // Форматируем отзывы для клиента
        const formattedReviews = reviews.map(review => ({
          id: review.id,
          userId: review.user_id,
          productId: review.product_id,
          rating: review.rating,
          text: review.text,
          isApproved: !!review.is_approved,
          createdAt: review.created_at,
          images: review.images ? JSON.parse(review.images) : []
        }));
        
        return res.json(formattedReviews);
      }
      
      // Получаем все отзывы (для админки)
      const reviews = db.query("SELECT * FROM reviews ORDER BY created_at DESC") as Array<{
        id: number;
        user_id: string | number;
        product_id: number;
        rating: number;
        text: string;
        is_approved: number;
        created_at: string;
        images: string;
      }>;
      
      // Форматируем отзывы для клиента
      const formattedReviews = reviews.map(review => ({
        id: review.id,
        userId: review.user_id,
        productId: review.product_id,
        rating: review.rating,
        text: review.text,
        isApproved: !!review.is_approved,
        createdAt: review.created_at,
        images: review.images ? JSON.parse(review.images) : []
      }));
      
      res.json(formattedReviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });
  
  // Добавляем маршрут для удаления отзыва
  app.delete("/api/reviews/:id", ensureAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Проверяем, существует ли отзыв
      const review = db.queryOne("SELECT * FROM reviews WHERE id = ?", [id]);
      
      if (!review) {
        return res.status(404).json({ message: "Отзыв не найден" });
      }
      
      // Удаляем отзыв
      db.run("DELETE FROM reviews WHERE id = ?", [id]);
      
      // Возвращаем успех
      return res.status(200).json({ message: "Отзыв успешно удален" });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ message: "Failed to delete review" });
    }
  });

  // Добавляем маршрут для редактирования отзыва (admin)
  app.put("/api/reviews/:id", ensureAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isApproved } = req.body;
      
      // Проверяем, существует ли отзыв
      const review = db.queryOne("SELECT * FROM reviews WHERE id = ?", [id]) as {
        id: number;
        user_id: string | number;
        product_id: number;
        rating: number;
        text: string;
        is_approved: number;
        created_at: string;
        updated_at?: string;
        images?: string;
      } | null;
      
      if (!review) {
        return res.status(404).json({ message: "Отзыв не найден" });
      }
      
      console.log(`Обновление статуса отзыва #${id}: isApproved=${isApproved}`);
      
      // Обновляем статус отзыва
      db.run(
        "UPDATE reviews SET is_approved = ?, updated_at = ? WHERE id = ?",
        [isApproved ? 1 : 0, new Date().toISOString(), id]
      );
      
      // Получаем обновленный отзыв
      const updatedReview = db.queryOne("SELECT * FROM reviews WHERE id = ?", [id]) as {
        id: number;
        user_id: string | number;
        product_id: number;
        rating: number;
        text: string;
        is_approved: number;
        created_at: string;
        updated_at?: string;
        images?: string;
      };
      
      if (!updatedReview) {
        return res.status(404).json({ message: "Не удалось найти обновленный отзыв" });
      }
      
      console.log(`Отзыв #${id} обновлен. Новый статус: ${updatedReview.is_approved === 1 ? 'Одобрен' : 'Не одобрен'}`);
      
      // Форматируем отзыв для ответа
      const formattedReview = {
        id: updatedReview.id,
        userId: updatedReview.user_id,
        productId: updatedReview.product_id,
        rating: updatedReview.rating,
        text: updatedReview.text,
        images: updatedReview.images ? JSON.parse(updatedReview.images) : [],
        isApproved: updatedReview.is_approved === 1,
        createdAt: updatedReview.created_at,
        updatedAt: updatedReview.updated_at
      };
      
      res.json({
        message: isApproved ? "Отзыв успешно опубликован" : "Статус отзыва успешно обновлен",
        review: formattedReview
      });
    } catch (error) {
      console.error("Ошибка при обновлении отзыва:", error);
      res.status(500).json({ message: "Ошибка при обновлении отзыва" });
    }
  });

  // Добавляем маршрут для создания отзыва
  app.post("/api/reviews", ensureAuthenticated, async (req, res) => {
    try {
      const { productId, rating, text, images = [] } = req.body;
      
      // Проверяем, что пользователь авторизован
      if (!req.user) {
        return res.status(401).json({ message: "Необходима авторизация" });
      }
      
      // Проверка базовых данных
      if (!productId || !rating || !text) {
        return res.status(400).json({ message: "Не указаны обязательные поля" });
      }
      
      // Создаем отзыв
      const result = db.insert(
        `INSERT INTO reviews (
          user_id, product_id, rating, text, images, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          productId,
          rating,
          text,
          JSON.stringify(images || []),
          new Date().toISOString()
        ]
      );
      
      // Получаем созданный отзыв
      const review = db.queryOne(
        "SELECT * FROM reviews WHERE id = ?",
        [result]
      ) as {
        id: number;
        user_id: string | number;
        product_id: number;
        rating: number;
        text: string;
        is_approved: number;
        created_at: string;
        images: string;
      };
      
      // Форматируем отзыв для клиента
      const formattedReview = {
        id: review.id,
        userId: review.user_id,
        productId: review.product_id,
        rating: review.rating,
        text: review.text,
        isApproved: !!review.is_approved,
        createdAt: review.created_at,
        images: review.images ? JSON.parse(review.images) : []
      };
      
      res.status(201).json(formattedReview);
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // User routes
  app.get("/api/users", ensureAdmin, async (req, res) => {
    try {
      // Получаем всех пользователей, включая текущего админа
      const users = db.query("SELECT * FROM users") as Array<{
        id: string;
        username: string;
        email: string;
        password: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        address: string | null;
        is_admin: number;
        balance: string | null;
        created_at: string;
        updated_at: string;
      }>;
      
      // Форматируем пользователей и удаляем пароли
      const formattedUsers = users.map(user => ({
        id: user.id,
        username: user.username || user.email,
        email: user.email,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        phone: user.phone || '',
        address: user.address || '',
        isAdmin: !!user.is_admin,
        balance: user.balance || '0',
        createdAt: user.created_at
      }));
      
      res.json(formattedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Маршрут для начисления баланса пользователю
  app.post("/api/users/:id/add-balance", ensureAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { amount } = req.body;
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Некорректная сумма для начисления" });
      }
      
      // Проверяем, существует ли пользователь
      const user = db.queryOne("SELECT * FROM users WHERE id = ?", [userId]) as {
        id: string;
        balance: string | null;
      } | null;
      
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      
      // Вычисляем новый баланс
      const currentBalance = user.balance ? parseFloat(user.balance) : 0;
      const newBalance = (currentBalance + parseFloat(amount)).toString();
      
      // Обновляем баланс пользователя
      db.run(
        "UPDATE users SET balance = ?, updated_at = ? WHERE id = ?",
        [newBalance, new Date().toISOString(), userId]
      );
      
      // Получаем обновленного пользователя
      const updatedUser = db.queryOne("SELECT * FROM users WHERE id = ?", [userId]) as {
        id: string;
        username: string;
        email: string;
        password: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        address: string | null;
        is_admin: number;
        balance: string | null;
        created_at: string;
        updated_at: string;
      };
      
      // Форматируем пользователя и удаляем пароль
      const formattedUser = {
        id: updatedUser.id,
        username: updatedUser.username || updatedUser.email,
        email: updatedUser.email,
        fullName: `${updatedUser.first_name || ''} ${updatedUser.last_name || ''}`.trim(),
        phone: updatedUser.phone || '',
        address: updatedUser.address || '',
        isAdmin: !!updatedUser.is_admin,
        balance: updatedUser.balance || '0',
        createdAt: updatedUser.created_at
      };
      
      res.json(formattedUser);
    } catch (error) {
      console.error("Error adding balance:", error);
      res.status(500).json({ message: "Failed to add balance" });
    }
  });

  // Маршрут для экспорта статистики в Excel
  app.get("/api/export/statistics", ensureAdmin, async (req, res) => {
    try {
      // Получаем статистику из базы данных
      const users = db.query("SELECT * FROM users") as Array<any>;
      const products = db.query("SELECT * FROM products") as Array<any>;
      const orders = db.query("SELECT * FROM orders") as Array<any>;
      
      // Генерируем CSV для статистики
      const csvContent = generateStatisticsCSV(users, products, orders);
      
      // Добавляем BOM для правильного отображения кириллицы
      const BOM = '\uFEFF';
      const csvContentWithBOM = BOM + csvContent;
      
      // Отправляем CSV файл
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="statistics.csv"');
      res.send(csvContentWithBOM);
    } catch (error) {
      console.error("Error exporting statistics:", error);
      res.status(500).json({ message: "Failed to export statistics" });
    }
  });

  // Маршрут для экспорта пользователей в Excel
  app.get("/api/export/users", ensureAdmin, async (req, res) => {
    try {
      // Получаем всех пользователей
      const users = db.query("SELECT * FROM users") as Array<{
        id: string;
        username: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        address: string | null;
        is_admin: number;
        balance: string | null;
        created_at: string;
      }>;
      
      // Генерируем CSV для пользователей
      const csvContent = generateUsersCSV(users);
      
      // Добавляем BOM для правильного отображения кириллицы
      const BOM = '\uFEFF';
      const csvContentWithBOM = BOM + csvContent;
      
      // Отправляем CSV файл
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
      res.send(csvContentWithBOM);
    } catch (error) {
      console.error("Error exporting users:", error);
      res.status(500).json({ message: "Failed to export users" });
    }
  });

  // Маршрут для экспорта товаров в Excel
  app.get("/api/export/products", ensureAdmin, async (req, res) => {
    try {
      // Получаем все товары
      const products = db.query("SELECT * FROM products") as Array<{
        id: number;
        name: string;
        description: string;
        price: number;
        original_price: number | null;
        quantity: number;
        category: string;
        is_available: number;
        is_preorder: number;
        is_rare: number;
        is_easy_to_care: number;
        created_at: string;
      }>;
      
      // Генерируем CSV для товаров
      const csvContent = generateProductsCSV(products);
      
      // Добавляем BOM для правильного отображения кириллицы
      const BOM = '\uFEFF';
      const csvContentWithBOM = BOM + csvContent;
      
      // Отправляем CSV файл
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
      res.send(csvContentWithBOM);
    } catch (error) {
      console.error("Error exporting products:", error);
      res.status(500).json({ message: "Failed to export products" });
    }
  });

  // Маршрут для экспорта заказов в Excel
  app.get("/api/export/orders", ensureAdmin, async (req, res) => {
    try {
      // Получаем все заказы
      const orders = db.query("SELECT * FROM orders ORDER BY created_at DESC") as Array<{
        id: number;
        user_id: string;
        items: string;
        total_amount: string;
        delivery_amount: string;
        full_name: string;
        phone: string;
        address: string;
        delivery_type: string;
        payment_method: string;
        payment_status: string;
        order_status: string;
        created_at: string;
      }>;
      
      // Генерируем CSV для заказов
      const csvContent = generateOrdersCSV(orders);
      
      // Добавляем BOM для правильного отображения кириллицы
      const BOM = '\uFEFF';
      const csvContentWithBOM = BOM + csvContent;
      
      // Отправляем CSV файл
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
      res.send(csvContentWithBOM);
    } catch (error) {
      console.error("Error exporting orders:", error);
      res.status(500).json({ message: "Failed to export orders" });
    }
  });

  // Helper function для форматирования заказа
  function formatOrderForClient(order: any) {
    if (!order) return null;
    
    // Преобразуем JSON строку items в массив объектов
    let items;
    try {
      if (typeof order.items === 'string') {
        items = JSON.parse(order.items);
      } else if (Array.isArray(order.items)) {
        items = order.items;
      } else {
        items = [];
      }
    } catch (e) {
      console.error("Ошибка при парсинге списка товаров:", e);
      items = [];
    }

    // Преобразование суммы заказа
    let totalAmount = "0";
    try {
      if (order.total_amount) {
        totalAmount = String(order.total_amount);
      } else if (order.totalAmount) {
        totalAmount = String(order.totalAmount);
      } else if (items && Array.isArray(items) && items.length > 0) {
        // Вычисляем сумму заказа из списка товаров
        totalAmount = String(items.reduce((sum, item) => {
          const price = parseFloat(String(item.price || 0));
          const quantity = parseInt(String(item.quantity || 1));
          return sum + (price * quantity);
        }, 0));
      }
    } catch (error) {
      console.error("Ошибка при вычислении суммы заказа:", error);
    }

    // Форматируем заказ для клиента
    return {
      id: order.id,
      userId: order.user_id || order.userId,
      items: items,
      totalAmount: totalAmount,
      deliveryAmount: order.delivery_amount || order.deliveryAmount || "0",
      fullName: order.full_name || order.fullName || "",
      address: order.address || "",
      phone: order.phone || "",
      socialNetwork: order.social_network || order.socialNetwork || null,
      socialUsername: order.social_username || order.socialUsername || null,
      comment: order.comment || "",
      deliveryType: order.delivery_type || order.deliveryType || "cdek",
      deliverySpeed: order.delivery_speed || order.deliverySpeed || 'standard',
      needInsulation: order.need_insulation === 1 || order.needInsulation === true,
      paymentMethod: order.payment_method || order.paymentMethod || "card",
      paymentStatus: order.payment_status || order.paymentStatus || "pending",
      orderStatus: order.order_status || order.orderStatus || "pending",
      paymentProofUrl: order.payment_proof_url ? 
        (order.payment_proof_url.startsWith('http') ? order.payment_proof_url : `${process.env.PUBLIC_URL || ''}${order.payment_proof_url}`) : 
        null,
      adminComment: order.admin_comment || order.adminComment || "",
      createdAt: order.created_at || order.createdAt || new Date().toISOString(),
      updatedAt: order.updated_at || order.updatedAt || null
    };
  }

  // Маршрут для обработки загрузки подтверждения оплаты
  app.post("/api/orders/:id/payment-proof", ensureAuthenticated, upload.single("proof"), async (req, res) => {
    try {
      if (!req.file) {
        console.error("[PAYMENT] Ошибка загрузки чека: файл не найден");
        return res.status(400).json({ message: "Файл не найден" });
      }
      
      const id = parseInt(req.params.id);
      const orderId = id.toString();
      
      console.log(`[PAYMENT] Загрузка чека для заказа ID=${orderId}, файл: ${req.file.filename}`);
      console.log(`[PAYMENT] Полный путь к файлу: ${path.resolve(req.file.path)}`);
      
      // Проверяем существование заказа
      const order = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]);
      if (!order) {
        console.error(`[PAYMENT] Заказ с ID=${orderId} не найден`);
        return res.status(404).json({ message: "Заказ не найден" });
      }
      
      // Формируем путь для доступа к файлу - сделаем его относительно корня сайта
      const relativePath = `/uploads/${req.file.filename}`;
      console.log(`[PAYMENT] Относительный путь для веб-доступа: ${relativePath}`);
      
      // Обновляем запись в базе данных
      db.run(
        "UPDATE orders SET payment_proof_url = ?, payment_status = ?, updated_at = ? WHERE id = ?",
        [relativePath, "pending_verification", new Date().toISOString(), orderId]
      );
      
      console.log(`[PAYMENT] Информация о чеке сохранена для заказа #${orderId}`);
      
      // Получаем обновленный заказ
      const updatedOrder = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]);
      
      // Возвращаем успешный результат с данными заказа
      return res.status(200).json({
        success: true,
        message: "Чек успешно загружен",
        order: updatedOrder
      });
    } catch (error) {
      console.error("[PAYMENT] Ошибка загрузки чека:", error);
      return res.status(500).json({ 
        success: false,
        message: "Произошла ошибка при загрузке чека",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Новый маршрут для финализации заказа после загрузки чека
  app.post("/api/orders/:id/complete", ensureAuthenticated, async (req, res) => {
    try {
      const orderId = req.params.id;
      
      // Получаем заказ из БД с явной типизацией
      const order = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]) as Record<string, any> | null;
      
      if (!order) {
        return res.status(404).json({ message: "Заказ не найден" });
      }
      
      // Проверяем доступ пользователя к этому заказу
      const user = req.user as any;
      if (!user.isAdmin && order.user_id !== user.id && order.user_id !== String(user.id)) {
        return res.status(403).json({ message: "Доступ запрещен" });
      }
      
      // Если чек уже загружен, меняем статус на "завершен"
      if (order.payment_proof_url) {
        db.run(
          `UPDATE orders SET 
           payment_status = ?, 
           order_status = ?, 
           updated_at = ? 
           WHERE id = ?`,
          ["verification", "pending", new Date().toISOString(), orderId]
        );
        
        // Возвращаем обновленный заказ
        const updatedOrder = db.queryOne(`SELECT * FROM orders WHERE id = ?`, [orderId]);
        const formattedOrder = formatOrderForClient(updatedOrder);
        
        return res.json({
          success: true,
          message: "Заказ успешно завершен и ожидает проверки оплаты",
          order: formattedOrder
        });
      } else {
        return res.status(400).json({ message: "Отсутствует подтверждение оплаты" });
      }
    } catch (error) {
      console.error("Error completing order:", error);
      res.status(500).json({ message: "Ошибка при завершении заказа" });
    }
  });

  // Маршрут для создания заказа с поддержкой оплаты через баланс
  app.post("/api/orders", ensureAuthenticated, async (req, res) => {
    try {
      const orderData = req.body;
      const user = req.user as Express.User;
      
      // Обновляем сессию перед созданием заказа для проверки актуального баланса
      syncUserSession(req);
      
      // Ensure userId matches authenticated user or admin
      if (String(user.id) !== String(orderData.userId) && !user.isAdmin) {
        return res.status(403).json({ message: "Нельзя создать заказ от имени другого пользователя" });
      }
      
      // Убедимся, что передан корректный массив товаров
      if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
        return res.status(400).json({ message: "Корзина пуста или имеет неверный формат" });
      }
      
      // Проверим наличие товаров перед оформлением заказа
      for (const item of orderData.items) {
        const product = db.queryOne("SELECT * FROM products WHERE id = ?", [item.id]) as { 
          quantity: number; 
          name: string;
        } | null;
        
        if (!product) {
          return res.status(400).json({ 
            message: `Товар с ID ${item.id} не найден` 
          });
        }
        
        if (product.quantity < item.quantity) {
          return res.status(400).json({ 
            message: `Недостаточное количество товара "${product.name}" в наличии (доступно: ${product.quantity})` 
          });
        }
      }
      
      // Если оплата с баланса, проверяем и обновляем баланс
      if (orderData.paymentMethod === "balance") {
        try {
          // Получаем данные пользователя из БД
          const dbUser = db.queryOne("SELECT * FROM users WHERE id = ?", [user.id]) as {
            balance: string;
            id: string;
            [key: string]: any;
          } | null;
          
          if (!dbUser) {
            return res.status(404).json({ message: "Пользователь не найден" });
          }
          
          // Форматируем баланс и общую сумму для проверки
          const currentBalance = parseFloat(dbUser.balance || "0");
          const totalAmount = parseFloat(orderData.totalAmount || "0");
          
          console.log(`Проверка баланса для заказа: Баланс=${currentBalance}, Сумма заказа=${totalAmount}`);
          
          // Проверяем достаточно ли средств
          if (currentBalance < totalAmount) {
            return res.status(400).json({ 
              message: "Недостаточно средств на балансе", 
              currentBalance, 
              totalAmount
            });
          }
          
          // Списываем средства с баланса пользователя
          const newBalance = (currentBalance - totalAmount).toFixed(2);
          db.run(
            "UPDATE users SET balance = ? WHERE id = ?", 
            [newBalance, user.id]
          );
          
          console.log(`Баланс пользователя ${user.id} обновлен после оплаты заказа: ${currentBalance} → ${newBalance}`);
          
          // Обновляем баланс в сессии
          user.balance = newBalance;
          
          // Списываем товары с баланса сразу после успешной оплаты
          console.log("Начинаем списание товаров после оплаты с баланса:");
          for (const item of orderData.items) {
            const product = db.queryOne("SELECT * FROM products WHERE id = ?", [item.id]) as {
              quantity: number;
              name: string;
              id: number;
            } | null;
            
            if (product) {
              const newQuantity = Math.max(0, product.quantity - item.quantity);
              db.run(
                "UPDATE products SET quantity = ? WHERE id = ?",
                [newQuantity, item.id]
              );
              console.log(`Списано ${item.quantity} единиц товара "${product.name}" (ID: ${product.id}), новое количество: ${newQuantity}`);
            }
          }
        } catch (error) {
          console.error("Ошибка при обработке баланса:", error);
          return res.status(500).json({ message: "Ошибка при проверке баланса" });
        }
      }
      
      // Форматируем данные для сохранения в SQLite
      const orderToSave = {
        user_id: orderData.userId,
        items: JSON.stringify(orderData.items),
        total_amount: orderData.totalAmount,
        delivery_amount: orderData.deliveryAmount,
        full_name: orderData.fullName,
        address: orderData.address,
        phone: orderData.phone,
        social_network: orderData.socialNetwork || null,
        social_username: orderData.socialUsername || null,
        comment: orderData.comment || null,
        need_insulation: orderData.needInsulation ? 1 : 0,
        delivery_type: orderData.deliveryType,
        delivery_speed: orderData.deliverySpeed || null,
        payment_method: orderData.paymentMethod,
        payment_status: orderData.paymentMethod === "balance" ? "completed" : "pending",
        order_status: orderData.paymentMethod === "balance" ? "processing" : "pending",
        payment_proof_url: null,
        admin_comment: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Сохраняем заказ в БД
      const result = db.run(
        `INSERT INTO orders (
          user_id, items, total_amount, delivery_amount, full_name, 
          address, phone, social_network, social_username, comment,
          need_insulation, delivery_type, delivery_speed,
          payment_method, payment_status, order_status,
          payment_proof_url, admin_comment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderToSave.user_id,
          orderToSave.items,
          orderToSave.total_amount,
          orderToSave.delivery_amount,
          orderToSave.full_name,
          orderToSave.address,
          orderToSave.phone,
          orderToSave.social_network,
          orderToSave.social_username,
          orderToSave.comment,
          orderToSave.need_insulation,
          orderToSave.delivery_type,
          orderToSave.delivery_speed,
          orderToSave.payment_method,
          orderToSave.payment_status,
          orderToSave.order_status,
          orderToSave.payment_proof_url,
          orderToSave.admin_comment,
          orderToSave.created_at,
          orderToSave.updated_at
        ]
      );
      
      // Получаем созданный заказ
      const orderId = result.lastInsertRowid;
      const createdOrder = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]);
      
      if (!createdOrder) {
        return res.status(500).json({ message: "Ошибка при создании заказа" });
      }
      
      // Если заказ с прямой оплатой (не через баланс) и статус оплаты подтвержден, уменьшаем количество товаров
      if (orderData.paymentMethod !== "balance" && orderData.paymentProof) {
        console.log("Начинаем списание товаров для заказа с подтвержденной оплатой:");
        for (const item of orderData.items) {
          const product = db.queryOne("SELECT * FROM products WHERE id = ?", [item.id]) as {
            quantity: number;
            name: string;
          } | null;
          
          if (product) {
            const newQuantity = Math.max(0, product.quantity - item.quantity);
            db.run(
              "UPDATE products SET quantity = ? WHERE id = ?",
              [newQuantity, item.id]
            );
            console.log(`Списано ${item.quantity} единиц товара "${product.name}" (ID: ${item.id}), новое количество: ${newQuantity}`);
          }
        }
      }
      
      // Форматируем заказ для клиента
      const formattedOrder = formatOrderForClient(createdOrder);
      
      res.json({
        ...formattedOrder,
        message: orderData.paymentMethod === "balance" 
          ? "Заказ успешно оплачен с вашего баланса" 
          : (orderData.paymentMethod === "yoomoney" 
            ? "Заказ создан. Ожидается оплата через ЮМани"
            : "Заказ создан. Ожидается загрузка подтверждения оплаты")
      });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(400).json({
        message: "Не удалось создать заказ",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Получение всех заказов (для админки)
  app.get("/api/orders", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      let orders: Record<string, any>[];
      
      // TypeScript type assertion for user
      const user = req.user as Express.User;
      
      if (user.isAdmin) {
        // Admin gets all orders
        orders = db.query("SELECT * FROM orders ORDER BY created_at DESC") as Record<string, any>[];
      } else {
        // Regular users get only their orders
        orders = db.query("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", [user.id]) as Record<string, any>[];
      }
      
      // Enrich orders with product information
      const enrichedOrders = await Promise.all(orders.map(async (order) => {
        try {
          // Parse items from JSON string
          const items = JSON.parse(order.items || '[]');
          
          // Ensure we have product details for each item
          const enrichedItems = await Promise.all(items.map(async (item: any) => {
            // Fetch product details for each order item
            const product = db.queryOne("SELECT * FROM products WHERE id = ?", [item.id]) as {
              id: number;
              name: string;
              images: string;
              [key: string]: any;
            } | null;
            
            if (product) {
              const productImages = product.images ? JSON.parse(product.images) : [];
              const imageUrl = productImages && productImages.length > 0 ? productImages[0] : null;
              
              return {
                ...item, 
                productName: product.name, 
                productImage: imageUrl
              };
            }
            return item;
          }));
          
          return {
            ...order,
            items: enrichedItems
          };
        } catch (error) {
          console.error(`Ошибка при обработке заказа #${order.id}:`, error);
          return order;
        }
      }));
      
      res.json(enrichedOrders);
    } catch (error) {
      console.error("Ошибка при получении списка заказов:", error);
      res.status(500).json({ message: "Ошибка при получении списка заказов" });
    }
  });
  
  // Получение конкретного заказа
  app.get("/api/orders/:id", ensureAuthenticated, async (req, res) => {
    try {
      const orderId = req.params.id;
      
      // TypeScript type assertion for user
      const user = req.user as Express.User;
      
      let order: Record<string, any> | null;
      
      if (user.isAdmin) {
        // Admin can view any order
        order = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]) as Record<string, any> | null;
      } else {
        // Users can only view their own orders
        order = db.queryOne("SELECT * FROM orders WHERE id = ? AND user_id = ?", [orderId, user.id]) as Record<string, any> | null;
      }
      
      if (!order) {
        return res.status(404).json({ message: "Заказ не найден" });
      }
      
      // Parse and enrich items
      try {
        const items = JSON.parse(order.items || "[]");
        
        // Enrich each item with product details
        const enrichedItems = await Promise.all(items.map(async (item: any) => {
          // Получаем данные о товаре из базы данных
          const product = db.queryOne("SELECT * FROM products WHERE id = ?", [item.id]) as {
            id: number;
            name: string;
            images: string;
            price: number;
            [key: string]: any;
          } | null;
          
          if (product) {
            const productImages = product.images ? JSON.parse(product.images) : [];
            const imageUrl = productImages && productImages.length > 0 ? productImages[0] : null;
            
            // Сохраняем данные о товаре в заказе
            return {
              ...item,
              productName: product.name,
              productImage: imageUrl,
              price: item.price || product.price
            };
          }
          return item;
        }));
        
        // Обновляем items в заказе
        order.items = enrichedItems;
      } catch (error) {
        console.error(`Error processing order ${order.id} items:`, error);
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Ошибка при получении данных заказа" });
    }
  });

  // Маршрут для обновления данных заказа
  app.put("/api/orders/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const { orderStatus, adminComment } = req.body;
      
      console.log(`[ORDERS] Запрос на обновление статуса заказа #${orderId}:`, req.body);
      
      // Получаем текущий заказ
      const orderQuery = "SELECT * FROM orders WHERE id = ?";
      const currentOrder = db.queryOne(orderQuery, [orderId]) as Record<string, any>;
      
      if (!currentOrder) {
        return res.status(404).json({ message: "Заказ не найден" });
      }
      
      const prevStatus = currentOrder.order_status || 'unknown';
      console.log(`[ORDERS] Текущий статус заказа #${orderId}: ${prevStatus}`);
      
      // Формируем полный объект обновления с типизацией
      const updateData: Record<string, any> = {};
      
      // Обновляем статус если он передан
      if (orderStatus) {
        updateData.order_status = orderStatus;
        console.log(`[ORDERS] Новый статус заказа: ${orderStatus}`);
      }
      
      // Обновляем комментарий если он передан
      if (adminComment !== undefined) {
        updateData.admin_comment = adminComment;
        console.log(`[ORDERS] Обновлен комментарий админа`);
      }
      
      // Добавляем дату обновления
      updateData.updated_at = new Date().toISOString();
      
      // Формируем SQL запрос и параметры
      const fields = Object.keys(updateData).map(key => `${key} = ?`).join(", ");
      const values = Object.values(updateData);
      values.push(orderId); // Добавляем ID для WHERE
      
      // Выполняем запрос на обновление
      db.run(`UPDATE orders SET ${fields} WHERE id = ?`, values);
      
      // Если заказ переходит в статус "оплачен" или "в обработке", уменьшаем количество товаров
      if (orderStatus && 
          (orderStatus === "paid" || orderStatus === "processing") &&
          prevStatus !== "paid" && 
          prevStatus !== "processing") {
        
        console.log(`[ORDERS] Заказ #${orderId} переходит в статус ${orderStatus}, требуется списание товаров`);
        
        try {
          // Получаем товары из заказа
          let items = [];
          
          try {
            // Безопасный парсинг JSON
            const itemsData = String(currentOrder?.items || "[]").trim();
            
            if (itemsData) {
              // Проверяем, является ли строка уже массивом (не строкой JSON)
              if (Array.isArray(currentOrder?.items)) {
                console.log(`[ORDERS] Данные товаров уже являются массивом`);
                items = currentOrder.items;
              } else {
                // Пробуем распарсить JSON
                try {
                  items = JSON.parse(itemsData);
                  
                  // Проверяем, что результат - массив
                  if (!Array.isArray(items)) {
                    console.error(`[ORDERS] Данные товаров после парсинга не являются массивом:`, items);
                    items = [];
                  }
                } catch (parseError) {
                  console.error(`[ORDERS] Ошибка при парсинге товаров:`, parseError, "Данные:", itemsData);
                  
                  // Дополнительная проверка на случай двойного экранирования JSON
                  if (itemsData.startsWith('"[') && itemsData.endsWith(']"')) {
                    try {
                      const unescaped = JSON.parse(itemsData);
                      items = JSON.parse(unescaped);
                      console.log(`[ORDERS] Успешно распарсены вложенные JSON-данные товаров`);
                    } catch (nestedError) {
                      console.error(`[ORDERS] Ошибка при парсинге вложенного JSON:`, nestedError);
                      items = [];
                    }
                  } else {
                    items = [];
                  }
                }
              }
            }
            
            console.log(`[ORDERS] Получены данные товаров:`, items.length > 0 ? `${items.length} позиций` : "нет товаров");
          } catch (error) {
            console.error(`[ORDERS] Критическая ошибка при обработке товаров:`, error);
            items = [];
          }
          
          // Вызываем функцию для списания товаров
          if (items.length > 0) {
            updateProductQuantities(orderId, items);
          } else {
            console.warn(`[ORDERS] Нет товаров для списания в заказе #${orderId}`);
          }
        } catch (error) {
          console.error(`[ORDERS] Ошибка при обработке списания товаров:`, error);
        }
      }
      
      // Получаем обновленный заказ
      const updatedOrder = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]);
      
      // Отправляем успешный ответ
      return res.status(200).json({
        success: true,
        message: "Заказ успешно обновлен",
        order: updatedOrder
      });
    } catch (error) {
      console.error(`[ORDERS] Ошибка при обновлении заказа:`, error);
      return res.status(500).json({ 
        success: false,
        message: "Произошла ошибка при обновлении заказа",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Маршрут для удаления заказа
  app.delete("/api/orders/:id", ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
    try {
      const orderId = req.params.id;
      
      // Проверяем наличие заказа
      const order = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]);
      if (!order) {
        return res.status(404).json({ message: `Заказ #${orderId} не найден` });
      }
      
      // Удаляем заказ
      db.run("DELETE FROM orders WHERE id = ?", [orderId]);
      console.log(`Заказ #${orderId} успешно удален`);
      
      res.json({ success: true, message: `Заказ #${orderId} успешно удален` });
    } catch (error) {
      console.error("Ошибка при удалении заказа:", error);
      res.status(500).json({ message: "Ошибка при удалении заказа" });
    }
  });

  // Обновление пользователя
  app.put("/api/users/:id", ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.params.id;
      const user = req.user as Express.User;
      
      // Проверка прав доступа: только админы или сам пользователь могут обновлять профиль
      const isOwnProfile = String(user.id) === String(userId);
      if (!isOwnProfile && !user.isAdmin) {
        return res.status(403).json({ message: "Доступ запрещен" });
      }
      
      // Только админы могут менять статус администратора и баланс
      if (!user.isAdmin) {
        delete req.body.is_admin;
        delete req.body.isAdmin;
        delete req.body.balance;
      }
      
      // Получаем текущие данные пользователя
      const existingUser = db.queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRecord | null;
      if (!existingUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      
      // Проверка на смену пароля
      if (req.body.password && !user.isAdmin) {
        if (!req.body.oldPassword) {
          return res.status(400).json({ message: "Требуется текущий пароль" });
        }
        
        // Проверяем текущий пароль
        const currentPasswordValid = verifyPassword(req.body.oldPassword, existingUser.password);
        if (!currentPasswordValid) {
          return res.status(400).json({ message: "Неверный текущий пароль" });
        }
        
        // Хешируем новый пароль
        req.body.password = hashPassword(req.body.password);
      }
      
      // Проверка на уникальность email при его изменении
      if (req.body.email && req.body.email !== existingUser.email) {
        const emailExists = db.queryOne("SELECT * FROM users WHERE email = ? AND id != ?", [
          req.body.email.toLowerCase(), userId
        ]);
        
        if (emailExists) {
          return res.status(400).json({ message: "Email уже используется другим пользователем" });
        }
      }
      
      // Формируем SQL запрос для обновления
      const updateFields = [];
      const updateValues = [];
      
      // Обрабатываем разные поля
      if (req.body.email) {
        updateFields.push("email = ?");
        updateValues.push(req.body.email.toLowerCase());
      }
      
      if (req.body.fullName) {
        const nameParts = req.body.fullName.trim().split(" ");
        updateFields.push("first_name = ?");
        updateValues.push(nameParts[0] || "");
        
        updateFields.push("last_name = ?");
        updateValues.push(nameParts.slice(1).join(" ") || "");
      }
      
      if (req.body.phone) {
        updateFields.push("phone = ?");
        updateValues.push(req.body.phone);
      }
      
      if (req.body.address) {
        updateFields.push("address = ?");
        updateValues.push(req.body.address);
      }
      
      if (req.body.username) {
        updateFields.push("username = ?");
        updateValues.push(req.body.username);
      }
      
      if (req.body.password) {
        updateFields.push("password = ?");
        updateValues.push(req.body.password);
      }
      
      if (user.isAdmin && req.body.isAdmin !== undefined) {
        updateFields.push("is_admin = ?");
        updateValues.push(req.body.isAdmin ? 1 : 0);
      }
      
      if (user.isAdmin && req.body.balance !== undefined) {
        updateFields.push("balance = ?");
        updateValues.push(req.body.balance.toString());
      }
      
      // Добавляем обновление даты
      updateFields.push("updated_at = ?");
      updateValues.push(new Date().toISOString());
      
      // ID пользователя для WHERE
      updateValues.push(userId);
      
      // Если есть поля для обновления
      if (updateFields.length > 0) {
        const updateQuery = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`;
        db.run(updateQuery, updateValues);
      }
      
      // Получаем обновленного пользователя
      const updatedUser = db.queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRecord;
      
      if (!updatedUser) {
        return res.status(404).json({ message: "Пользователь не найден после обновления" });
      }
      
      // Форматируем ответ
      const formattedUser = {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username || updatedUser.email,
        fullName: `${updatedUser.first_name || ''} ${updatedUser.last_name || ''}`.trim(),
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        phone: updatedUser.phone || '',
        address: updatedUser.address || '',
        isAdmin: !!updatedUser.is_admin,
        balance: updatedUser.balance || '0'
      };
      
      // Если пользователь обновлял свой профиль, обновляем данные в сессии
      if (isOwnProfile) {
        // Обновляем объект пользователя в сеансе
        Object.assign(user, {
          email: formattedUser.email,
          firstName: formattedUser.firstName,
          lastName: formattedUser.lastName,
          fullName: formattedUser.fullName,
          phone: formattedUser.phone,
          address: formattedUser.address,
          isAdmin: formattedUser.isAdmin,
          balance: formattedUser.balance
        });
        
        console.log("Данные пользователя в сессии обновлены:", user.email);
      }
      
      res.json(formattedUser);
    } catch (error) {
      console.error("Ошибка при обновлении профиля:", error);
      res.status(500).json({ message: "Ошибка сервера при обновлении профиля" });
    }
  });

  // Функция для списания товаров из заказа
  async function updateProductQuantities(orderId: string, items: any[]): Promise<boolean> {
    console.log(`[ORDERS] Списание товаров для заказа #${orderId}`);
    
    if (!orderId) {
      console.error(`[ORDERS] Ошибка: Не указан ID заказа для списания товаров`);
      return false;
    }
    
    if (!Array.isArray(items) || items.length === 0) {
      console.log(`[ORDERS] Нет товаров для списания в заказе #${orderId}`);
      return false;
    }
    
    // Проверяем, существует ли колонка product_quantities_reduced
    try {
      const tableInfo = db.query("PRAGMA table_info(orders)");
      const hasColumn = tableInfo.some((col: any) => col.name === 'product_quantities_reduced');
      
      if (!hasColumn) {
        // Добавляем колонку, если её нет
        console.log(`[ORDERS] Добавление колонки product_quantities_reduced в таблицу orders`);
        try {
          db.exec("ALTER TABLE orders ADD COLUMN product_quantities_reduced INTEGER DEFAULT 0");
        } catch (e) {
          console.error(`[ORDERS] Ошибка при добавлении колонки:`, e);
          // Продолжаем работу даже если не удалось добавить колонку
        }
      }
    } catch (schemaError) {
      console.error(`[ORDERS] Ошибка при проверке схемы:`, schemaError);
    }
    
    // Проверяем, не списаны ли уже товары для этого заказа
    try {
      const orderRecord = db.queryOne(
        "SELECT * FROM orders WHERE id = ?", 
        [orderId]
      ) as Record<string, any> | null;
      
      if (orderRecord && 
          typeof orderRecord === 'object' && 
          'product_quantities_reduced' in orderRecord && 
          orderRecord.product_quantities_reduced === 1) {
        console.log(`[ORDERS] Товары для заказа #${orderId} уже были списаны ранее`);
        return true; // Считаем успешным, так как товары уже списаны
      }
    } catch (checkError) {
      console.error(`[ORDERS] Ошибка при проверке статуса списания:`, checkError);
      // Продолжаем, так как лучше попытаться списать товары, чем не списать
    }
    
    console.log(`[ORDERS] Начинаем списание ${items.length} товаров`);
    
    // Обработка списания в одной транзакции
    try {
      // Начинаем транзакцию
      db.exec("BEGIN TRANSACTION");
      let success = true;
      
      // Обрабатываем каждый товар
      for (const item of items) {
        try {
          if (!item || typeof item !== 'object') {
            console.warn(`[ORDERS] Пропуск невалидного товара:`, item);
            continue;
          }
          
          // Получаем ID товара
          const productId = item.id ? String(item.id) : null;
          if (!productId) {
            console.warn(`[ORDERS] Товар без ID:`, item);
            continue;
          }
          
          // Количество для списания
          let quantity = 0;
          try {
            quantity = parseInt(String(item.quantity || 0));
            if (isNaN(quantity) || quantity <= 0) {
              console.warn(`[ORDERS] Некорректное количество товара:`, item);
              continue;
            }
          } catch (quantityError) {
            console.error(`[ORDERS] Ошибка при обработке количества:`, quantityError);
            continue;
          }
          
          // Получаем текущий товар
          const product = db.queryOne(
            "SELECT id, name, quantity FROM products WHERE id = ?", 
            [productId]
          ) as Record<string, any> | null;
          
          if (!product) {
            console.warn(`[ORDERS] Товар с ID=${productId} не найден в базе`);
            continue;
          }
          
          // Текущее количество товара
          let currentQuantity = 0;
          try {
            currentQuantity = parseInt(String(product.quantity || 0));
            if (isNaN(currentQuantity)) currentQuantity = 0;
          } catch (parseError) {
            console.error(`[ORDERS] Ошибка при парсинге текущего количества:`, parseError);
            currentQuantity = 0;
          }
          
          // Рассчитываем новое количество (не меньше нуля)
          const newQuantity = Math.max(0, currentQuantity - quantity);
          console.log(`[ORDERS] Обновление количества товара "${product.name}" (ID=${productId}): ${currentQuantity} → ${newQuantity}`);
          
          // Обновляем количество товара
          try {
            const updateResult = db.run(
              "UPDATE products SET quantity = ? WHERE id = ?",
              [newQuantity, productId]
            );
            
            if (!updateResult || updateResult.changes === 0) {
              console.error(`[ORDERS] Не удалось обновить количество товара ID=${productId}`);
              success = false;
            }
          } catch (updateError) {
            console.error(`[ORDERS] Ошибка при обновлении товара:`, updateError);
            success = false;
          }
        } catch (itemError) {
          console.error(`[ORDERS] Ошибка при обработке товара:`, itemError);
          success = false;
        }
      }
      
      // Если все товары обработаны успешно, помечаем заказ
      if (success) {
        try {
          // Помечаем заказ как обработанный
          const markResult = db.run(
            "UPDATE orders SET product_quantities_reduced = 1 WHERE id = ?",
            [orderId]
          );
          
          if (!markResult || markResult.changes === 0) {
            console.warn(`[ORDERS] Не удалось пометить заказ #${orderId} как обработанный`);
          }
          
          // Применяем транзакцию
          db.exec("COMMIT");
          console.log(`[ORDERS] Товары успешно списаны для заказа #${orderId}`);
          return true;
        } catch (markError) {
          console.error(`[ORDERS] Ошибка при обновлении статуса заказа:`, markError);
          db.exec("ROLLBACK");
          return false;
        }
      } else {
        // При ошибках в обработке товаров отменяем транзакцию
        console.error(`[ORDERS] Ошибки при списании товаров, отмена транзакции`);
        db.exec("ROLLBACK");
        return false;
      }
    } catch (transactionError) {
      console.error(`[ORDERS] Критическая ошибка в транзакции:`, transactionError);
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error(`[ORDERS] Ошибка при отмене транзакции:`, rollbackError);
      }
      return false;
    }
  }

  // Маршрут для обновления статуса заказа
  app.put("/api/orders/:id/status", ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const { orderStatus } = req.body;
      
      if (!orderStatus) {
        return res.status(400).json({ message: "Не указан новый статус заказа" });
      }
      
      console.log(`[ORDERS] Запрос на обновление статуса заказа #${orderId} на ${orderStatus}`);
      
      // Получаем текущий заказ
      const currentOrder = db.queryOne(
        "SELECT * FROM orders WHERE id = ?",
        [orderId]
      ) as Record<string, any> | null;
      
      if (!currentOrder) {
        console.error(`[ORDERS] Заказ #${orderId} не найден`);
        return res.status(404).json({ message: "Заказ не найден" });
      }
      
      // Определяем предыдущий статус
      const previousStatus = currentOrder.order_status || "pending";
      
      console.log(`[ORDERS] Изменение статуса заказа #${orderId}: ${previousStatus} -> ${orderStatus}`);
      
      // Обновляем статус заказа в базе данных
      db.run(
        "UPDATE orders SET order_status = ?, updated_at = ? WHERE id = ?",
        [orderStatus, new Date().toISOString(), orderId]
      );
      
      // Если заказ переходит в статус "оплачен" или "в обработке", уменьшаем количество товаров
      if ((orderStatus === "paid" || orderStatus === "processing") &&
          (previousStatus !== "paid" && previousStatus !== "processing")) {
        
        console.log(`[ORDERS] Заказ #${orderId} переведен в статус ${orderStatus}, требуется списание товаров`);
        
        try {
          // Получаем товары из заказа
          let items: any[] = [];
          
          try {
            // Обработка различных форматов items
            if (typeof currentOrder.items === 'string') {
              // Безопасный парсинг JSON
              const itemsText = String(currentOrder.items || "[]").trim();
              
              if (itemsText) {
                if (itemsText.startsWith('[') && itemsText.endsWith(']')) {
                  // Стандартный JSON массив
                  items = JSON.parse(itemsText);
                } else if (itemsText.startsWith('"[') && itemsText.endsWith(']"')) {
                  // Случай двойной сериализации
                  const unescaped = JSON.parse(itemsText);
                  items = JSON.parse(unescaped);
                } else {
                  console.error(`[ORDERS] Неизвестный формат items: ${itemsText.substring(0, 50)}...`);
                }
              }
            } else if (Array.isArray(currentOrder.items)) {
              // Если items уже является массивом
              items = currentOrder.items;
            }
          } catch (parseError) {
            console.error(`[ORDERS] Ошибка при парсинге товаров:`, parseError);
            
            // В случае ошибки парсинга, создаем запасной вариант с одним товаром
            if (currentOrder.total_amount) {
              items = [{
                id: 0, // Фиктивный ID
                quantity: 1,
                price: currentOrder.total_amount
              }];
              console.log(`[ORDERS] Создан запасной элемент заказа на сумму ${currentOrder.total_amount}`);
            }
          }
          
          if (items.length === 0) {
            console.log(`[ORDERS] Заказ #${orderId} не содержит товаров для списания`);
          } else {
            // Вызываем функцию для списания товаров
            const success = await updateProductQuantities(orderId, items);
            
            if (success) {
              console.log(`[ORDERS] Товары успешно списаны для заказа #${orderId}`);
            } else {
              console.error(`[ORDERS] Ошибка при списании товаров для заказа #${orderId}`);
            }
          }
        } catch (productError) {
          console.error(`[ORDERS] Ошибка при обработке списания товаров:`, productError);
          // Не прерываем обновление статуса при ошибке списания
        }
      } else {
        console.log(`[ORDERS] Заказ #${orderId} не требует списания товаров при переходе ${previousStatus} -> ${orderStatus}`);
      }
      
      // Возвращаем обновленный заказ
      const updatedOrder = db.queryOne("SELECT * FROM orders WHERE id = ?", [orderId]);
      return res.json({ 
        success: true, 
        message: "Статус заказа успешно обновлен", 
        order: formatOrderForClient(updatedOrder) 
      });
      
    } catch (error) {
      console.error(`[ORDERS] Ошибка при обновлении статуса заказа:`, error);
      res.status(500).json({
        success: false,
        message: "Ошибка сервера при обновлении статуса заказа",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Маршрут для получения заказов пользователя
  app.get("/api/user/orders", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Получаем заказы пользователя из БД
      const orders = db.query(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", 
        [user.id]
      ) as Array<Record<string, any>>;
      
      // Форматируем заказы для клиента
      const formattedOrders = orders.map(order => formatOrderForClient(order));
      
      res.json(formattedOrders);
    } catch (error) {
      console.error("Ошибка при получении заказов пользователя:", error);
      res.status(500).json({ 
        message: "Не удалось загрузить заказы пользователя",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Маршрут для получения отзывов пользователя
  app.get("/api/user/reviews", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Получаем все отзывы пользователя из БД
      const reviews = db.query(
        "SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC", 
        [user.id]
      ) as Array<Record<string, any>>;
      
      // Форматируем отзывы
      const formattedReviews = reviews.map(review => ({
        id: review.id,
        userId: review.user_id,
        productId: review.product_id,
        rating: review.rating,
        text: review.text,
        images: review.images ? JSON.parse(review.images) : [],
        isApproved: review.is_approved === 1,
        createdAt: review.created_at,
      }));
      
      res.json(formattedReviews);
    } catch (error) {
      console.error("Ошибка при получении отзывов пользователя:", error);
      res.status(500).json({
        message: "Не удалось загрузить отзывы пользователя", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Маршрут для получения уведомлений пользователя
  app.get("/api/user/notifications", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Получаем все уведомления пользователя из БД
      const notifications = db.query(
        "SELECT n.*, p.name as product_name, p.image_url FROM notifications n LEFT JOIN products p ON n.product_id = p.id WHERE n.user_id = ? ORDER BY n.created_at DESC", 
        [user.id]
      ) as Array<Record<string, any>>;
      
      // Форматируем уведомления
      const formattedNotifications = notifications.map(notification => ({
        id: notification.id,
        userId: notification.user_id,
        productId: notification.product_id,
        type: notification.type,
        seen: notification.seen === 1,
        product: notification.product_name ? {
          id: notification.product_id,
          name: notification.product_name,
          imageUrl: notification.image_url
        } : null,
        createdAt: notification.created_at,
      }));
      
      res.json(formattedNotifications);
    } catch (error) {
      console.error("Ошибка при получении уведомлений пользователя:", error);
      res.status(500).json({ 
        message: "Не удалось загрузить уведомления пользователя",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Регистрация пользователя
  app.post("/api/auth/register", async (req, res) => {
    try {
      // Валидация данных из запроса
      const { email, password, fullName, username, phone, address } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          message: "Ошибка валидации", 
          errors: { 
            email: !email ? "Email обязателен" : null,
            password: !password ? "Пароль обязателен" : null 
          }
        });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ 
          message: "Ошибка валидации", 
          errors: { 
            password: "Пароль должен быть не менее 8 символов" 
          }
        });
      }
      
      try {
        // Импортируем функцию явно из auth-sqlite.ts 
        const { registerUser } = await import("./auth-sqlite");
        
        // Выполняем регистрацию
        const user = await registerUser({
          email, 
          password,
          fullName,
          username,
          phone,
          address
        });
        
        // Автоматически авторизуем пользователя после регистрации
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("Ошибка при автоматической авторизации после регистрации:", loginErr);
            return res.json({
              message: "Регистрация успешна, но требуется вход в систему",
              user
            });
          }
          
          // Успешная авторизация после регистрации
          res.json({
            message: "Регистрация успешна",
            user
          });
        });
      } catch (registerError: any) {
        if (registerError.message === 'Пользователь с таким email уже существует') {
          return res.status(400).json({
            message: "Ошибка регистрации",
            errors: { email: "Пользователь с таким email уже существует" }
          });
        }
        throw registerError;
      }
    } catch (error) {
      console.error("Ошибка при регистрации:", error);
      res.status(500).json({
        message: "Не удалось зарегистрироваться",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create HTTP server
  return createServer(app);
}

// Middleware для проверки авторизации
function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    // Обновим данные пользователя перед продолжением
    const updated = syncUserSession(req);
    
    // Проверяем ID пользователя
    if (req.user && (req.user as any).id) {
      const userId = (req.user as any).id;
      
      // Проверим существование пользователя в базе
      const existingUser = db.queryOne("SELECT * FROM users WHERE id = ?", [userId]);
      
      if (!existingUser) {
        console.error(`Ошибка авторизации: Пользователь с ID ${userId} не найден в базе данных`);
        req.logout(() => {
          res.status(401).json({ message: "Сессия недействительна. Пожалуйста, войдите снова." });
        });
        return;
      }
      
      console.log(`Пользователь ${userId} авторизован успешно. Баланс: ${(req.user as any).balance || '0'}`);
    return next();
  }
    
    console.error("Ошибка авторизации: ID пользователя не определен");
    res.status(401).json({ message: "Ошибка авторизации: ID пользователя не определен" });
    return;
  }
  
  res.status(401).json({ message: "Необходима авторизация" });
}

// Middleware для проверки прав администратора с обновлением сессии
function ensureAdmin(req: Request, res: Response, next: Function) {
  console.log("Проверка прав администратора:", req.user);
  
  if (req.isAuthenticated() && req.user) {
    // Обновим данные пользователя перед проверкой
    syncUserSession(req);
    
    const user = req.user as any;
    
    // Сначала проверяем кэш админов
    if (adminCache.has(user.id)) {
      console.log("🔑 Права администратора подтверждены из кэша для:", user.email);
      
      // Восстанавливаем права в объекте пользователя
      user.isAdmin = true;
      user.is_admin = 1;
      
    return next();
  }
    
    // Проверяем наличие прав администратора в базе данных
    try {
      // Проверяем, что пользователь действительно админ в базе данных и получаем свежие данные
      const dbUser = db.queryOne("SELECT * FROM users WHERE id = ?", [user.id]) as Record<string, any>;
      
      if (dbUser && (
          typeof dbUser === 'object' && 
          ('is_admin' in dbUser) && 
          (dbUser.is_admin === 1 || Boolean(dbUser.is_admin) === true)
        )) {
        // Обновляем сессию и добавляем в кэш админов
        user.isAdmin = true;
        user.is_admin = 1;
        adminCache.add(user.id);
        
        console.log("✓ Права администратора подтверждены для:", user.email);
        return next();
      } else {
        console.log("✗ Пользователь не имеет прав администратора в базе данных:", user.email);
      }
    } catch (error) {
      console.error("Ошибка при проверке прав администратора:", error);
    }
  }
  
  res.status(403).json({ message: "Недостаточно прав доступа" });
}

// Функция для генерации CSV для пользователей
function generateUsersCSV(users: Array<any>): string {
  const headers = [
    "ID", "Имя пользователя", "Email", "ФИО", "Телефон", 
    "Адрес", "Статус", "Баланс", "Дата регистрации"
  ];

  let csvContent = headers.join(';') + '\n';
  
  users.forEach(user => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const row = [
      user.id,
      user.username || user.email,
      user.email,
      escapeCSVField(fullName),
      escapeCSVField(user.phone || ''),
      escapeCSVField(user.address || ''),
      user.is_admin ? "Администратор" : "Пользователь",
      `${user.balance || '0'} ₽`,
      new Date(user.created_at).toLocaleDateString('ru-RU')
    ];
    
    csvContent += row.join(';') + '\n';
  });
  
  return csvContent;
}

// Функция для генерации CSV для статистики
function generateStatisticsCSV(users: Array<any>, products: Array<any>, orders: Array<any>): string {
  let csvContent = "Общая статистика сайта\n\n";
  
  // Секция статистики пользователей
  csvContent += "Статистика пользователей\n";
  csvContent += `Всего пользователей;${users.length}\n`;
  csvContent += `Администраторов;${users.filter(u => u.is_admin === 1).length}\n\n`;
  
  // Секция статистики товаров
  csvContent += "Статистика товаров\n";
  csvContent += `Всего товаров;${products.length}\n`;
  csvContent += `Доступных товаров;${products.filter(p => p.is_available === 1).length}\n`;
  csvContent += `Товаров на предзаказ;${products.filter(p => p.is_preorder === 1).length}\n\n`;
  
  // Секция статистики заказов
  csvContent += "Статистика заказов\n";
  csvContent += `Всего заказов;${orders.length}\n`;
  
  // Статистика по статусам заказов
  const ordersByStatus: Record<string, number> = {};
  orders.forEach(order => {
    const status = order.status || 'Неизвестно';
    ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
  });
  
  Object.entries(ordersByStatus).forEach(([status, count]) => {
    csvContent += `${status};${count}\n`;
  });
  
  return csvContent;
}

// Вспомогательная функция для экранирования полей в CSV
function escapeCSVField(field: string): string {
  if (!field) return '';
  
  // Поскольку мы используем точку с запятой как разделитель,
  // нужно экранировать только точку с запятой, кавычки и переносы строк
  if (field.includes(';') || field.includes('"') || field.includes('\n')) {
    // Заменяем кавычки на двойные кавычки для экранирования
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Функция для форматирования данных товара для клиента
function formatProductForClient(product: any) {
  if (!product) return null;
  
  // Преобразуем строку JSON в массив для images и labels
  let images = [];
  if (product.images) {
    try {
      images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
    } catch (e) {
      console.error("Ошибка при парсинге JSON images:", e);
    }
  }
  
  let labels = [];
  if (product.labels) {
    try {
      labels = typeof product.labels === 'string' ? JSON.parse(product.labels) : product.labels;
    } catch (e) {
      console.error("Ошибка при парсинге JSON labels:", e);
    }
  }
  
  // Формируем объект товара с правильными именами полей
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    originalPrice: product.original_price,
    images: images,
    quantity: product.quantity,
    category: product.category,
    isAvailable: Boolean(product.is_available),
    isPreorder: Boolean(product.is_preorder),
    isRare: Boolean(product.is_rare),
    isEasyToCare: Boolean(product.is_easy_to_care),
    labels: labels,
    deliveryCost: product.delivery_cost,
    createdAt: product.created_at,
    updatedAt: product.updated_at
  };
}

// Функция для генерации CSV для товаров
function generateProductsCSV(products: Array<any>): string {
  const headers = [
    "ID", "Название", "Описание", "Цена", "Исходная цена", 
    "Количество", "Категория", "Доступен", "Предзаказ", 
    "Редкий", "Простой уход", "Дата создания"
  ];

  let csvContent = headers.join(';') + '\n';
  
  products.forEach(product => {
    const row = [
      product.id,
      escapeCSVField(product.name || ''),
      escapeCSVField(product.description || ''),
      product.price ? product.price.toString().replace('.', ',') : '0',
      product.original_price ? product.original_price.toString().replace('.', ',') : '',
      product.quantity || '0',
      escapeCSVField(product.category || ''),
      product.is_available ? "Да" : "Нет",
      product.is_preorder ? "Да" : "Нет",
      product.is_rare ? "Да" : "Нет",
      product.is_easy_to_care ? "Да" : "Нет",
      new Date(product.created_at).toLocaleDateString('ru-RU')
    ];
    
    csvContent += row.join(';') + '\n';
  });
  
  return csvContent;
}

// Функция для генерации CSV для заказов
function generateOrdersCSV(orders: Array<any>): string {
  const headers = [
    "ID", "Клиент", "Телефон", "Адрес", "Сумма", "Доставка", 
    "Способ оплаты", "Статус оплаты", "Статус заказа", "Дата создания"
  ];

  let csvContent = headers.join(';') + '\n';
  
  orders.forEach(order => {
    const paymentMethodMap: Record<string, string> = {
      "yoomoney": "Онлайн оплата",
      "directTransfer": "Прямой перевод",
      "balance": "Баланс"
    };
    
    const paymentStatusMap: Record<string, string> = {
      "pending": "Ожидает оплаты",
      "completed": "Оплачен",
      "failed": "Ошибка оплаты"
    };
    
    const orderStatusMap: Record<string, string> = {
      "pending": "В ожидании",
      "processing": "В обработке",
      "shipped": "Отправлен",
      "completed": "Завершен",
      "cancelled": "Отменен"
    };
    
    const row = [
      order.id,
      escapeCSVField(order.full_name || ''),
      escapeCSVField(order.phone || ''),
      escapeCSVField(order.address || ''),
      `${parseFloat(order.total_amount || 0).toLocaleString('ru-RU')} ₽`,
      order.delivery_type === "cdek" ? "СДЭК" : "Почта России",
      paymentMethodMap[order.payment_method] || order.payment_method,
      paymentStatusMap[order.payment_status] || order.payment_status,
      orderStatusMap[order.order_status] || order.order_status,
      new Date(order.created_at).toLocaleDateString('ru-RU')
    ];
    
    csvContent += row.join(';') + '\n';
  });
  
  return csvContent;
}

// Прямое обновление сессии пользователя (для синхронизации баланса)
export function updateUserSession(req: Request) {
  if (req.isAuthenticated() && req.user) {
    const user = req.user as any;
    
    try {
      // Сохраним текущие значения перед обновлением
      const prevIsAdmin = user.isAdmin === true || user.is_admin === 1;
      
      // Получаем актуальные данные пользователя из БД с явной типизацией
      const dbUser = db.queryOne("SELECT * FROM users WHERE id = ?", [user.id]) as Record<string, any> | null;
      
      if (dbUser) {
        // Обновляем данные в сессии с проверкой наличия свойств
        const currentBalance = parseFloat(user.balance || "0");
        const newBalance = parseFloat(dbUser.balance || "0");
        
        // Логируем изменение баланса
        if (Math.abs(currentBalance - newBalance) > 0.01) {  // учитываем погрешность при сравнении float
          console.log(`Баланс пользователя ${user.id} обновлен: ${currentBalance} → ${newBalance}`);
        }
        
        user.balance = dbUser.balance || "0";
        
        // Явно проверяем и обновляем статус администратора
        if ((dbUser.is_admin === 1) || prevIsAdmin) {
          user.is_admin = 1;
          user.isAdmin = true;
        }
        
        // Обновляем другие важные поля только если они существуют в объекте
        if ('first_name' in dbUser) user.firstName = dbUser.first_name;
        if ('last_name' in dbUser) user.lastName = dbUser.last_name;
        
        console.log(`Сессия пользователя ${dbUser.email || 'unknown'} обновлена. Админ: ${user.isAdmin}, Баланс: ${user.balance}`);
      }
    } catch (error) {
      console.error("Ошибка при обновлении сессии пользователя:", error);
    }
  }
} 