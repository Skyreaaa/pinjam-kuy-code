// Script migrasi file lokal ke Cloudinary dan update DB
// Jalankan dengan: node utils/migrateUploadsToCloudinary.js
// Pastikan .env berisi kredensial Cloudinary & koneksi DB.
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cloudinary = require('../config/cloudinary');

async function pingCloudinary(){
  return new Promise((resolve) => {
    try {
      cloudinary.api.ping((err, res) => {
        if (err) {
          console.warn('[PING] Gagal ping Cloudinary:', err.message || err);
          return resolve(false);
        }
        console.log('[PING] Cloudinary OK:', res);
        resolve(true);
      });
    } catch(e){
      console.warn('[PING] Exception Cloudinary ping:', e.message);
      resolve(false);
    }
  });
}

async function uploadWithRetry(localPath, options, retries = 3){
  for (let attempt=1; attempt<=retries; attempt++){
    try {
      return await cloudinary.uploader.upload(localPath, options);
    } catch(e){
      const isTimeout = /ETIMEDOUT|ESOCKETTIMEDOUT|ENOTFOUND|ECONNRESET/i.test(e.message || '');
      console.warn(`[UPLOAD][${attempt}/${retries}] Gagal ${path.basename(localPath)}:`, e.message);
      if (!isTimeout || attempt === retries) throw e;
      const backoff = attempt * 1000;
      await new Promise(r=>setTimeout(r, backoff));
    }
  }
}

async function main(){
  if (process.env.USE_CLOUDINARY !== 'true') {
    console.error('SET USE_CLOUDINARY=true untuk migrasi.');
    process.exit(1);
  }
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 5
  });

  // Preflight ping
  await pingCloudinary();

  // Migrasi cover buku
  const coversDir = path.join(__dirname, '..', 'uploads', 'book-covers');
  if (fs.existsSync(coversDir)) {
    const files = fs.readdirSync(coversDir).filter(f=>/\.(png|jpe?g|webp|avif)$/i.test(f));
    console.log('[BOOK COVERS] ditemukan', files.length, 'file.');
    for (const file of files){
      try {
        // Cek apakah sudah URL Cloudinary di DB (skip)
        const [rows] = await pool.query('SELECT id FROM books WHERE image_url = ? OR image_url LIKE ?', [file, `%/${file}`]);
        if (!rows.length) continue; // file tidak dipakai
        const localPath = path.join(coversDir, file);
        const up = await uploadWithRetry(localPath, { folder: process.env.CLOUDINARY_FOLDER_BOOKS || 'pinjam-kuy/book-covers' });
        await pool.query('UPDATE books SET image_url=? WHERE image_url=?', [up.secure_url, file]);
        console.log('-> Buku dengan file', file, 'diupdate ke URL Cloudinary');
      } catch(e){
        console.warn('Gagal migrasi cover', file, e.message);
      }
    }
  } else {
    console.log('[BOOK COVERS] Folder tidak ada, skip.');
  }

  // Migrasi fine proofs
  const finesDir = path.join(__dirname, '..', 'uploads', 'fine-proofs');
  if (fs.existsSync(finesDir)) {
    const files = fs.readdirSync(finesDir).filter(f=>/\.(png|jpe?g|webp|avif)$/i.test(f));
    console.log('[FINE PROOFS] ditemukan', files.length, 'file.');
    for (const file of files){
      try {
        const relPath = '/uploads/fine-proofs/' + file;
        const [rows] = await pool.query('SELECT id FROM loans WHERE finePaymentProof = ?', [relPath]);
        if (!rows.length) continue; // tidak dipakai
        const localPath = path.join(finesDir, file);
        const up = await uploadWithRetry(localPath, { folder: process.env.CLOUDINARY_FOLDER_FINES || 'pinjam-kuy/fine-proofs' });
        await pool.query('UPDATE loans SET finePaymentProof=? WHERE finePaymentProof=?', [up.secure_url, relPath]);
        console.log('-> Bukti denda', file, 'diupdate ke URL Cloudinary');
      } catch(e){
        console.warn('Gagal migrasi bukti denda', file, e.message);
      }
    }
  } else {
    console.log('[FINE PROOFS] Folder tidak ada, skip.');
  }

  await pool.end();
  console.log('Selesai migrasi.');
}

main().catch(e=>{
  console.error('Fatal migrasi:', e);
  process.exit(1);
});