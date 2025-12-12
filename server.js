require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const cors = require("cors");
app.use(cors());
// Middlewares
app.use(helmet());
app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true }
}));

// Ensure admin
(async () => {
  try {
    const existing = db.prepare('SELECT * FROM admins WHERE username = ?').get(ADMIN_USERNAME);
    if (!existing) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, hash);
      console.log("Admin created");
    }
  } catch (e) {
    console.error('Admin init error:', e);
  }
})();

// Helper
function getActive() {
  const row = db.prepare('SELECT active_value as value, updated_at FROM config WHERE id = 1').get();
  return row || { value: null, updated_at: null };
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// API ROUTES

app.get('/api/test', (req, res) => {
  res.json({ message: "Backend работает!" });
});

app.get('/api/active', (req, res) => {
  const row = getActive();
  res.json({ value: row.value, updatedAt: row.updated_at });
});

app.post('/api/generate', (req, res) => {
  const row = getActive();
  if (row.value == null) return res.status(400).json({ error: 'Active value not set' });

  const now = new Date().toISOString();
  db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)').run(row.value, 'user', now);

  res.json({ value: row.value, generatedAt: now });
});

app.get('/api/history', (req, res) => {
  const rows = db.prepare('SELECT value, actor, timestamp FROM history ORDER BY id DESC LIMIT 50').all();
  res.json(rows);
});

// Admin
app.post('/api/admin/login', async (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.body.username);
  if (!admin) return res.status(401).json({ error: 'Invalid' });

  const ok = await bcrypt.compare(req.body.password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid' });

  req.session.admin = admin;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/admin/active', requireAdmin, (req, res) => {
  const value = parseInt(req.body.value);
  if (isNaN(value)) return res.status(400).json({ error: 'Invalid value' });

  const now = new Date().toISOString();
  db.prepare('UPDATE config SET active_value = ?, updated_at = ? WHERE id = 1').run(value, now);
  db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)').run(value, 'admin', now);

  res.json({ ok: true, value, updatedAt: now });
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'frontend', 'build')));
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'))
);

// Start server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
