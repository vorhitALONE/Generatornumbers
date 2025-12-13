require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Простое хранилище токенов в памяти (для production лучше использовать Redis)
const activeSessions = new Map();

console.log('🚀 Starting server on port:', PORT);
console.log('📁 Current directory:', __dirname);
console.log('🔧 NODE_ENV:', process.env.NODE_ENV);

// Middlewares - CORS
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'https://vorhitalone-generator--a39d.twc1.net',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization']
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure admin
(async () => {
  try {
    const existing = db.prepare('SELECT * FROM admins WHERE username = ?').get(ADMIN_USERNAME);
    if (!existing) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, hash);
      console.log("✅ Admin created successfully");
    } else {
      console.log("✅ Admin already exists");
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

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  console.log('🔐 Checking token:', token);
  
  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Unauthorized - Please login again' });
  }
  
  const session = activeSessions.get(token);
  
  if (!session) {
    console.log('❌ Invalid or expired token');
    return res.status(401).json({ error: 'Unauthorized - Please login again' });
  }
  
  // Проверяем, не истёк ли токен
  if (Date.now() > session.expiresAt) {
    console.log('❌ Token expired');
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Session expired - Please login again' });
  }
  
  console.log('✅ Admin authenticated:', session.username);
  req.admin = session;
  next();
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
    
    console.log('🔑 Login attempt for:', username);
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) {
      console.log('❌ Admin not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      console.log('❌ Password incorrect');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Генерируем токен
    const token = generateToken();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 часа
    
    activeSessions.set(token, {
      id: admin.id,
      username: admin.username,
      expiresAt
    });
    
    console.log('✅ Admin logged in:', admin.username);
    console.log('📋 Token generated:', token.substring(0, 10) + '...');
    
    res.json({ 
      ok: true, 
      username: admin.username,
      token: token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    activeSessions.delete(token);
    console.log('✅ Admin logged out');
  }
  res.json({ ok: true });
});

app.post('/api/admin/active', requireAdmin, (req, res) => {
  try {
    console.log('📝 Setting active value:', req.body);
    
    const value = parseInt(req.body.value);
    if (isNaN(value)) {
      return res.status(400).json({ error: 'Некорректное число' });
    }

    const now = new Date().toISOString();
    
    const exists = db.prepare('SELECT id FROM config WHERE id = 1').get();
    if (!exists) {
      db.prepare('INSERT INTO config (id, active_value, updated_at) VALUES (1, ?, ?)').run(value, now);
    } else {
      db.prepare('UPDATE config SET active_value = ?, updated_at = ? WHERE id = 1').run(value, now);
    }
    
    db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)').run(value, 'admin', now);

    console.log('✅ Active value set to:', value);
    res.json({ ok: true, value, updatedAt: now });
  } catch (error) {
    console.error('Error setting active value:', error);
    res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
  }
});

app.get('/api/admin/check', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  console.log('🔍 Checking token:', token?.substring(0, 10) + '...');
  
  if (!token) {
    return res.json({ authenticated: false });
  }
  
  const session = activeSessions.get(token);
  
  if (session && Date.now() < session.expiresAt) {
    res.json({ authenticated: true, username: session.username });
  } else {
    if (session) activeSessions.delete(token);
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Admin username: ${ADMIN_USERNAME}`);
});
