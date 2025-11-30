// Cloudinary config wrapper
// Requires env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
const cloudinaryLib = require('cloudinary').v2;

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  const timeout = parseInt(process.env.CLOUDINARY_TIMEOUT_MS || '60000', 10); // default 60s
  cloudinaryLib.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    timeout
  });
  console.log('[Cloudinary] Configured with timeout', timeout,'ms');
} else {
  console.warn('[Cloudinary] ENV tidak lengkap. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.');
}

module.exports = cloudinaryLib;