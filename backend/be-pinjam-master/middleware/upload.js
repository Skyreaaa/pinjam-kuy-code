// File: middleware/upload.js
// Middleware upload dengan dukungan Cloudinary (opsional via env USE_CLOUDINARY=true)
const multer = require('multer');
const path = require('path');
const fs = require('fs');
let cloudinary;
try { cloudinary = require('../config/cloudinary'); } catch { cloudinary = null; }

// Jika tidak pakai Cloudinary: tetap simpan ke disk (fallback)
const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const base = path.join(__dirname, '..', 'uploads', 'book-covers');
        if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
        cb(null, base);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const npm = req.userData && req.userData.npm ? req.userData.npm : 'user';
        cb(null, 'book-cover-' + npm + '-' + uniqueSuffix + path.extname(file.originalname || ''));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Tipe file tidak didukung, hanya gambar.'), false);
};

// Jika Cloudinary aktif -> gunakan memory storage agar bisa langsung di-stream
const useCloudinary = process.env.USE_CLOUDINARY === 'true' && cloudinary;
const storage = useCloudinary ? multer.memoryStorage() : diskStorage;

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware tambahan untuk upload ke Cloudinary setelah Multer memproses
async function cloudinaryProcessor(req, res, next) {
    if (!useCloudinary) return next();
    if (!req.file) return next();
    try {
        const folder = process.env.CLOUDINARY_FOLDER_BOOKS || 'pinjam-kuy/book-covers';
        const base64 = req.file.buffer.toString('base64');
        const dataUri = 'data:' + (req.file.mimetype || 'image/jpeg') + ';base64,' + base64;
        const result = await cloudinary.uploader.upload(dataUri, { folder, resource_type: 'image' });
        req.file.cloudinaryUrl = result.secure_url;
        req.file.cloudinaryPublicId = result.public_id;
        next();
    } catch (e) {
        console.error('[Cloudinary Upload] Gagal:', e.message);
        next(e);
    }
}

module.exports = { upload, cloudinaryProcessor, useCloudinary };