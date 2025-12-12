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
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_secret_key_123';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: ['https://vorhitalone-generator--a39d.twc1.net', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Ensure admin
(async () => {
  try {
    const existing = db.prepare('SELECT * FROM admins WHERE username = ?').get(ADMIN_USERNAME);
    if (!existing) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, hash);
      console.log("✅ Admin created successfully");
    }
  } catch (e) {
    console.error('❌ Admin init error:', e);
  }
})();

// Helper functions
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
  res.json({ message: "Backend работает!", timestamp: new Date().toISOString() });
});

app.get('/api/active', (req, res) => {
  try {
    const row = getActive();
    res.json({ value: row.value, updatedAt: row.updated_at });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/generate', (req, res) => {
  try {
    const row = getActive();
    if (row.value == null) {
      return res.status(400).json({ error: 'Active value not set' });
    }

    const now = new Date().toISOString();
    db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)').run(row.value, 'user', now);

    res.json({ value: row.value, generatedAt: now });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const rows = db.prepare('SELECT value, actor, timestamp FROM history ORDER BY id DESC LIMIT 50').all();
    res.json(rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.admin = { id: admin.id, username: admin.username };
    res.json({ ok: true, username: admin.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

app.post('/api/admin/active', requireAdmin, (req, res) => {
  try {
    const value = parseInt(req.body.value);
    if (isNaN(value)) {
      return res.status(400).json({ error: 'Invalid value' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE config SET active_value = ?, updated_at = ? WHERE id = 1').run(value, now);
    db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)').run(value, 'admin', now);

    res.json({ ok: true, value, updatedAt: now });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/check', (req, res) => {
  if (req.session && req.session.admin) {
    res.json({ authenticated: true, username: req.session.admin.username });
  } else {
    res.json({ authenticated: false });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server - ВАЖНО: 0.0.0.0 для Timeweb
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
