const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

const db = new Database(DB_PATH);

// Выполнить миграцию (инициализация)
const initSql = fs.readFileSync(path.join(__dirname, 'migrations', 'init.sql'), 'utf8');
db.exec(initSql);

// Создаём таблицу config и queue если их нет
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY,
    active_value INTEGER,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value INTEGER NOT NULL,
    added_at TEXT NOT NULL
  );
  
  INSERT OR IGNORE INTO config (id, active_value) VALUES (1, NULL);
`);

console.log('✅ Database initialized');

module.exports = db;
