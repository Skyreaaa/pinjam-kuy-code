// Serverless entry for Vercel: wrap existing Express app
const serverless = require('serverless-http');
const express = require('express');
const path = require('path');

// We will reuse the route modules from the existing backend
const adminRoutes = require('../routes/adminRoutes');
const authRoutes = require('../routes/auth');
const loanRoutes = require('../routes/loanRoutes');
const bookRoutes = require('../routes/bookRoutes');
const profileRoutes = require('../routes/profile');

const cors = require('cors');
const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env if present in serverless filesystem
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
} catch {}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static for uploads (note: on serverless, write persistence is limited)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Initialize DB pool once (cached across invocations if possible)
let pool;
async function getPool() {
  if (pool) return pool;
  const baseConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
  };
  const dbName = process.env.DB_DATABASE;
  pool = mysql.createPool({ ...baseConfig, database: dbName });
  return pool;
}

// Attach pool to req
app.use(async (req, res, next) => {
  try {
    const p = await getPool();
    req.app.set('dbPool', p);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'DB init failed', message: e.message });
  }
  next();
});

// Mount routes under /api/*
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/profile', profileRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, env: !!process.env.DB_HOST }));

module.exports = app;
module.exports.handler = serverless(app);
