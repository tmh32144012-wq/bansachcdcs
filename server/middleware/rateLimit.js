/**
 * Middleware giới hạn tần suất request theo cửa sổ trượt (Sliding-Window Rate Limiter)
 * Không phụ thuộc thư viện ngoài; tự động dọn bộ nhớ định kỳ.
 */
const createRateLimiter = ({
  windowMs = 60 * 1000,
  max = 120,
  keyPrefix = 'global',
  message = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau giây lát.',
} = {}) => {
  const hits = new Map();

  // Tự dọn các IP hết hạn mỗi 5 phút (unref để không chặn tiến trình thoát khi chạy test)
  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits.entries()) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, Math.max(windowMs, 60 * 1000));
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }

  return (req, res, next) => {
    const ip =
      (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    const current = (hits.get(key) || []).filter((t) => t > cutoff);

    if (current.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((current[0] + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    current.push(now);
    hits.set(key, current);
    next();
  };
};

module.exports = { createRateLimiter };
