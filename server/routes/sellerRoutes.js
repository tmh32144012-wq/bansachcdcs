const express = require('express');
const router = express.Router();
const {
  registerShop,
  getMyShop,
  updateMyShop,
  getMyShopBooks,
  createSellerBook,
  updateSellerBook,
  toggleSellerBookVisibility,
  getMyShopWallet,
  requestWithdrawal,
} = require('../controllers/shopController');
const { getSellerOrders, updateSellerOrderStatus } = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.post('/register-shop', registerShop);
router.get('/my-shop', getMyShop);
router.put('/my-shop', updateMyShop);

router.get('/books', getMyShopBooks);
router.post('/books', createSellerBook);
router.put('/books/:id', updateSellerBook);
router.patch('/books/:id/visibility', toggleSellerBookVisibility);

router.get('/orders', getSellerOrders);
router.put('/orders/:id/status', updateSellerOrderStatus);

router.get('/wallet', getMyShopWallet);
router.post('/wallet/withdraw', requestWithdrawal);

module.exports = router;
