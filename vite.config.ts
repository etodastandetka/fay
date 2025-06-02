import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Асинхронная конфигурация для поддержки динамических импортов
export default defineConfig(async () => {
  // Динамический импорт только в development-режиме для Replit
  const replitPlugins = 
    process.env.NODE_ENV !== "production" && process.env.REPL_ID
      ? [await import("@replit/vite-plugin-cartographer").then(m => m.cartographer())]
      : [];

  return {
    // Базовый путь (адаптивный в зависимости от окружения)
    base: process.env.NODE_ENV === 'production' ? '/' : './',
    
    plugins: [
      react(),
      runtimeErrorOverlay(),
      ...replitPlugins
    ],
    
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    
    // Конфигурация сервера разработки
    server: {
      port: 3000,
      host: true,
      open: true
    },
    
    // Конфигурация сборки
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      sourcemap: process.env.NODE_ENV !== 'production',
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js'
        }
      }
    },
    
    // Оптимизация для production
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
    }
  };
});
