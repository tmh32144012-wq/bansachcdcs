const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 phút
const SSE_TICKET_TTL_MS = 60 * 1000; // 60 giây

// Lưu danh sách jti CAPTCHA đã sử dụng (chống replay) & ticket SSE dùng 1 lần
const usedCaptchaJtis = new Map();
const sseTickets = new Map();

let warnedMissingSecret = false;

/**
 * Lấy JWT_SECRET an toàn (bắt buộc có ở production)
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET bắt buộc phải được cấu hình trong môi trường production!');
  }

  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn('[SECURITY WARNING] JWT_SECRET chưa được cấu hình trong server/.env — đang dùng khóa phát triển tạm thời.');
  }
  return 'vitabook_dev_only_fallback_secret_change_me';
};

/**
 * Dọn các entry đã hết hạn khỏi Map để tránh rò rỉ bộ nhớ
 */
const pruneExpiredEntries = (store) => {
  const now = Date.now();
  for (const [key, expiresAt] of store.entries()) {
    const exp = typeof expiresAt === 'number' ? expiresAt : expiresAt?.expiresAt || 0;
    if (exp <= now) {
      store.delete(key);
    }
  }
};

/**
 * Hash chuỗi CAPTCHA kèm khóa bí mật
 */
const hashCaptchaCode = (code, jti) => {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${jti}:${String(code || '').trim().toUpperCase()}`)
    .digest('hex');
};

/**
 * Tạo thử thách CAPTCHA xác thực phía Server (dùng 1 lần)
 */
const createCaptchaChallenge = (length = 5) => {
  pruneExpiredEntries(usedCaptchaJtis);

  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    code += CAPTCHA_CHARS[bytes[i] % CAPTCHA_CHARS.length];
  }

  const jti = crypto.randomBytes(12).toString('hex');
  const codeHash = hashCaptchaCode(code, jti);

  const captchaToken = jwt.sign(
    { purpose: 'captcha', jti, codeHash },
    getJwtSecret(),
    { expiresIn: Math.floor(CAPTCHA_TTL_MS / 1000) }
  );

  return {
    captchaToken,
    code,
    expiresInSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
  };
};

/**
 * Xác thực & tiêu thụ (single-use) mã CAPTCHA phía Server
 */
const verifyCaptchaChallenge = (captchaToken, captchaInput) => {
  pruneExpiredEntries(usedCaptchaJtis);

  if (!captchaToken || typeof captchaToken !== 'string') {
    return { valid: false, message: 'Thiếu mã xác thực CAPTCHA. Vui lòng tải lại mã mới.' };
  }
  if (!captchaInput || typeof captchaInput !== 'string' || !captchaInput.trim()) {
    return { valid: false, message: 'Vui lòng nhập mã xác nhận CAPTCHA.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(captchaToken, getJwtSecret());
  } catch {
    return { valid: false, message: 'Mã CAPTCHA đã hết hạn hoặc không hợp lệ. Vui lòng lấy mã mới.' };
  }

  if (decoded.purpose !== 'captcha' || !decoded.jti || !decoded.codeHash) {
    return { valid: false, message: 'Token CAPTCHA không hợp lệ.' };
  }

  if (usedCaptchaJtis.has(decoded.jti)) {
    return { valid: false, message: 'Mã CAPTCHA này đã được sử dụng. Vui lòng lấy mã mới.' };
  }

  const expectedHash = hashCaptchaCode(captchaInput, decoded.jti);
  const actualBuf = Buffer.from(expectedHash, 'hex');
  const storedBuf = Buffer.from(decoded.codeHash, 'hex');

  if (actualBuf.length !== storedBuf.length || !crypto.timingSafeEqual(actualBuf, storedBuf)) {
    return { valid: false, message: 'Mã xác nhận CAPTCHA chưa chính xác. Vui lòng thử lại!' };
  }

  // Đánh dấu đã dùng để chống replay attack
  const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + CAPTCHA_TTL_MS;
  usedCaptchaJtis.set(decoded.jti, expiresAt);

  return { valid: true };
};

/**
 * Tạo ticket SSE ngắn hạn (60 giây, dùng 1 lần) để không lộ JWT dài hạn trên URL query string
 */
const createSseTicket = (userId) => {
  pruneExpiredEntries(sseTickets);
  const ticket = crypto.randomBytes(24).toString('hex');
  sseTickets.set(ticket, {
    userId,
    expiresAt: Date.now() + SSE_TICKET_TTL_MS,
  });
  return ticket;
};

/**
 * Tiêu thụ ticket SSE (trả về userId nếu hợp lệ, ngược lại trả null)
 */
const consumeSseTicket = (ticket) => {
  pruneExpiredEntries(sseTickets);
  if (!ticket || typeof ticket !== 'string') return null;

  const entry = sseTickets.get(ticket);
  if (!entry) return null;
  sseTickets.delete(ticket);

  if (entry.expiresAt <= Date.now()) return null;
  return entry.userId;
};

/**
 * Kiểm tra Magic Bytes (chữ ký nhị phân thật) của buffer ảnh để chặn tệp giả mạo phần mở rộng
 */
const validateImageMagicBytes = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }

  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case 'image/png':
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );

    case 'image/gif': {
      const header = buffer.subarray(0, 6).toString('ascii');
      return header === 'GIF87a' || header === 'GIF89a';
    }

    case 'image/webp': {
      const riff = buffer.subarray(0, 4).toString('ascii');
      const webp = buffer.subarray(8, 12).toString('ascii');
      return riff === 'RIFF' && webp === 'WEBP';
    }

    default:
      return false;
  }
};

/**
 * Tạo cấu hình CORS whitelist an toàn
 */
const buildCorsOptions = () => {
  const rawOrigins = [
    process.env.CLIENT_URL,
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
  ]
    .filter(Boolean)
    .map((o) => o.trim().replace(/\/+$/, ''));

  const allowedSet = new Set(rawOrigins);

  return {
    origin: (origin, callback) => {
      // Cho phép request server-to-server / Postman / curl không gửi header Origin
      if (!origin) return callback(null, true);
      const normalized = origin.trim().replace(/\/+$/, '');
      if (allowedSet.has(normalized)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: Nguồn "${origin}" không nằm trong danh sách được phép.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
};

module.exports = {
  getJwtSecret,
  createCaptchaChallenge,
  verifyCaptchaChallenge,
  createSseTicket,
  consumeSseTicket,
  validateImageMagicBytes,
  buildCorsOptions,
};
