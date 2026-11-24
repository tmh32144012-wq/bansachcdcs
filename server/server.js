require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { getPool } = require('./config/db');
const { errorHandler } = require('./middleware/errorHandler');
const { createRateLimiter } = require('./middleware/rateLimit');
const { buildCorsOptions } = require('./utils/security');
const { runSafeMigrations } = require('./utils/migrations');

const authRoutes = require('./routes/authRoutes');
const bookRoutes = require('./routes/bookRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const authorRoutes = require('./routes/authorRoutes');
const orderRoutes = require('./routes/orderRoutes');
const shopRoutes = require('./routes/shopRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const managerRoutes = require('./routes/managerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const voucherRoutes = require('./routes/voucherRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const socialRoutes = require('./routes/socialRoutes');
const chatRoutes = require('./routes/chatRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const cartRoutes = require('./routes/cartRoutes');
const { getPublishers } = require('./controllers/authorController');
const { sweepExpiredQrSessions } = require('./controllers/orderController');
const { getSystemSetting } = require('./utils/helpers');

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');

// Security headers chuẩn cho mọi response
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Rate limiter tổng cho toàn bộ API (chống spam / DDoS cơ bản)
app.use(
  '/api',
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    keyPrefix: 'api-global',
    message: 'Hệ thống nhận quá nhiều yêu cầu từ địa chỉ IP của bạn. Vui lòng thử lại sau ít giây.',
  })
);

// Phục vụ tệp ảnh đã tải lên từ máy (ép nosniff + chỉ phục vụ nội dung tĩnh an toàn)
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  })
);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await getPool();
    res.json({
      status: 'OK',
      database: 'Connected',
      security: 'Server-CAPTCHA + RateLimit + TokenVersion + MagicBytesUpload + SseTicket',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', database: 'Disconnected', error: err.message });
  }
});

// Phí vận chuyển công khai cho trang Checkout
app.get('/api/public-settings', async (req, res, next) => {
  try {
    const pool = await getPool();
    const economy = Number(await getSystemSetting(pool, 'ShippingFeeEconomy', '15000'));
    const standard = Number(await getSystemSetting(pool, 'ShippingFeeStandard', '30000'));
    const expressFee = Number(await getSystemSetting(pool, 'ShippingFeeExpress', '50000'));
    const commissionRate = Number(await getSystemSetting(pool, 'CommissionRate', '5'));
    res.json({
      success: true,
      data: {
        shippingFees: { Economy: economy, Standard: standard, Express: expressFee },
        commissionRate,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Đăng ký các cụm RESTful API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/authors', authorRoutes);
app.get('/api/publishers', getPublishers);
app.use('/api/shops', shopRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/cart', cartRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy đường dẫn API: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('CORS:')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  return errorHandler(err, req, res, next);
});

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🏮 VitaBook Marketplace (Tết Cổ Truyền) Server: http://localhost:${PORT}`);
  console.log(`================================================================`);

  // Chạy migration an toàn bất đồng bộ & bật bộ quét tự động hủy phiên QR quá hạn 10 phút
  getPool()
    .then(async (pool) => {
      await runSafeMigrations(pool);
      await sweepExpiredQrSessions(pool);
      const qrSweeper = setInterval(() => {
        sweepExpiredQrSessions(pool);
      }, 30 * 1000);
      if (typeof qrSweeper.unref === 'function') qrSweeper.unref();
    })
    .catch((err) => {
      console.warn('[Startup] Chưa thể chạy migration ngay khi khởi động (kiểm tra SQL Server):', err.message);
    });
});
