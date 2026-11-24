const express = require('express');
const router = express.Router();
const { getActiveVouchers, createVoucher, deleteVoucher } = require('../controllers/voucherController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', getActiveVouchers);
router.post('/', authenticateToken, createVoucher);
router.delete('/:id', authenticateToken, deleteVoucher);

module.exports = router;
