require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true }
}));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Ensure admin user exists
(async () => {
  try {
    const saltRounds = 10;
    const existing = db.prepare('SELECT * FROM admins WHERE username = ?').get(ADMIN_USERNAME);
    if (!existing) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);
      db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, hash);
      console.log('Created admin user:', ADMIN_USERNAME);
    } else {
      console.log('Admin exists:', ADMIN_USERNAME);
    }
  } catch (err) {
    console.error('Error ensuring admin user:', err);
  }
})();

// Helper: get active
function getActive() {
  const row = db.prepare('SELECT active_value as value, updated_at FROM config WHERE id = 1').get();
  return row || { value: null, updated_at: null };
}

// Middleware to protect admin routes
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Public API
app.get('/api/active', (req, res) => {
  const row = getActive();
  res.json({ value: row.value, updatedAt: row.updated_at });
});

app.post('/api/generate', (req, res) => {
  const row = getActive();
  const now = new Date().toISOString();
  if (row.value === null || row.value === undefined) {
    return res.status(400).json({ error: 'Active number not set by admin' });
  }

  const value = row.value;
  const insert = db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)');
  insert.run(value, 'user', now);

  res.json({ value, generatedAt: now, source: 'admin' });
});

app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const rows = db.prepare('SELECT value, actor, timestamp FROM history ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows);
});

// Admin auth
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin) return res.status(401).json({ error: 'Invalid username or password' });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

  req.session.admin = { id: admin.id, username: admin.username };
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(err => {
    res.json({ ok: true });
  });
});

app.get('/api/admin/active', requireAdmin, (req, res) => {
  const row = getActive();
  res.json({ value: row.value, updatedAt: row.updated_at });
});

app.post('/api/admin/active', requireAdmin, (req, res) => {
  const { value } = req.body;
  if (value === undefined || value === null) return res.status(400).json({ error: 'Missing value' });

  const intValue = parseInt(value, 10);
  if (Number.isNaN(intValue)) return res.status(400).json({ error: 'Value must be integer' });

  const now = new Date().toISOString();
  db.prepare('UPDATE config SET active_value = ?, updated_at = ? WHERE id = 1').run(intValue, now);
  db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)').run(intValue, 'admin', now);

  res.json({ ok: true, value: intValue, updatedAt: now });
});

// Fallback for unknown routes
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
