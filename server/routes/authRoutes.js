const express = require('express');
const router = express.Router();
const {
  getCaptcha,
  register,
  login,
  socialLogin,
  getMe,
  updateProfile,
  changePassword,
  logoutAllDevices,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimit');

const loginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: 'auth-login',
  message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ vài phút rồi thử lại.',
});

const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyPrefix: 'auth-register',
  message: 'Quá nhiều yêu cầu đăng ký từ địa chỉ IP này. Vui lòng thử lại sau.',
});

const resetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'auth-reset',
  message: 'Bạn yêu cầu khôi phục mật khẩu quá nhiều lần. Vui lòng thử lại sau ít phút.',
});

router.get('/captcha', getCaptcha);
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/social-login', loginLimiter, socialLogin);
router.post('/forgot-password', resetLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);

router.get('/me', authenticateToken, getMe);
router.put('/profile', authenticateToken, updateProfile);
router.put('/change-password', authenticateToken, changePassword);
router.post('/logout-all', authenticateToken, logoutAllDevices);

module.exports = router;
