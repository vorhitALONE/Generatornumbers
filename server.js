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

// Middlewares - ИСПРАВЛЕННЫЙ CORS
app.use(cors({
  origin: function(origin, callback) {
    // Разрешаем все домены для разработки
    const allowedOrigins = [
      'https://vorhitalone-generator--a39d.twc1.net',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Временно разрешаем все
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ИСПРАВЛЕННАЯ СЕССИЯ - без secure cookie для отладки
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,  // ИЗМЕНЕНО: false для работы через http/https
    httpOnly: true,
    sameSite: 'none',  // ДОБАВЛЕНО: для кросс-доменных запросов
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
  console.log('🔐 Checking admin session:', req.session); // ДОБАВЛЕНО: логирование
  
  if (req.session && req.session.admin) {
    console.log('✅ Admin authenticated:', req.session.admin.username);
    return next();
  }
  
  console.log('❌ Admin not authenticated');
  res.status(401).json({ error: 'Unauthorized - Please login again' });
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
    
    console.log('🔑 Login attempt for:', username); // ДОБАВЛЕНО
    
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

    req.session.admin = { id: admin.id, username: admin.username };
    
    // ДОБАВЛЕНО: Сохраняем сессию явно
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }
      
      console.log('✅ Admin logged in:', admin.username);
      console.log('Session ID:', req.sessionID);
      res.json({ ok: true, username: admin.username });
    });
    
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
    console.log('📝 Setting active value:', req.body); // ДОБАВЛЕНО
    
    const value = parseInt(req.body.value);
    if (isNaN(value)) {
      console.log('❌ Invalid value:', req.body.value);
      return res.status(400).json({ error: 'Invalid value' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE config SET active_value = ?, updated_at = ? WHERE id = 1').run(value, now);
    db.prepare('INSERT INTO history (value, actor, timestamp) VALUES (?, ?, ?)').run(value, 'admin', now);

    console.log('✅ Active value set to:', value);
    res.json({ ok: true, value, updatedAt: now });
  } catch (error) {
    console.error('Error setting active value:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.get('/api/admin/check', (req, res) => {
  console.log('🔍 Checking session:', req.session); // ДОБАВЛЕНО
  
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Admin username: ${ADMIN_USERNAME}`);
});
