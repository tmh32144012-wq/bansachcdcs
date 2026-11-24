const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  confirmOrderReceived,
  cancelMyOrder,
  confirmQrScanPayment,
  getQrPaymentStatus,
  simulateQrPayment,
  createQrSessionForOrder,
} = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/authMiddleware');

// PUBLIC endpoint để điện thoại quét trực tiếp mã QR thanh toán (không cần đăng nhập trên điện thoại)
router.get('/qr-pay/:token', confirmQrScanPayment);

router.use(authenticateToken);

router.post('/', createOrder);
router.get('/my-orders', getMyOrders);
router.get('/qr-status/:token', getQrPaymentStatus);
router.post('/qr-simulate/:token', simulateQrPayment);
router.post('/:id/qr-session', createQrSessionForOrder);
router.put('/:id/confirm-received', confirmOrderReceived);
router.put('/:id/cancel', cancelMyOrder);

module.exports = router;
