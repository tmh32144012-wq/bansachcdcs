/**
 * Middleware xử lý lỗi tập trung (Global Error Handler)
 */
const errorHandler = (err, req, res, next) => {
  console.error('[API Error]:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Đã xảy ra lỗi hệ thống phía máy chủ.';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };

