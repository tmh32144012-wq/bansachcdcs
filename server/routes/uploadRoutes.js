const express = require('express');
const router = express.Router();
const { uploadImages } = require('../controllers/uploadController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimit');

const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyPrefix: 'upload-images',
  message: 'Bạn đã tải lên quá nhiều ảnh trong thời gian ngắn. Vui lòng thử lại sau vài phút.',
});

router.post('/images', authenticateToken, uploadLimiter, uploadImages);

module.exports = router;
