// db.js
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// 1) Куда сохранять данные (чтобы на Timeweb точно были права на запись)
const DEFAULT_DATA_DIR = "/tmp/generatornumbers";
const DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;

// 2) Полный путь к файлу базы
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "database.sqlite");

// Создаём папку под БД, если её нет
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Открываем/создаём SQLite базу
const db = new Database(DB_PATH);

// Базовые настройки
db.pragma("journal_mode = WAL");

// Таблица для номеров
db.exec(`
  CREATE TABLE IF NOT EXISTS numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;