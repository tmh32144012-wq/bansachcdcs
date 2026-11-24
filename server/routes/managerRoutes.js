const express = require('express');
const router = express.Router();
const {
  getManagerOverview,
  getShopsForReview,
  reviewShop,
  getBooksForReview,
  reviewBook,
  toggleFlashSale,
  getAllOrdersForTracking,
  addTrackingEvent,
  getDisputes,
  resolveDispute,
  getReviewsForModeration,
  moderateReview,
} = require('../controllers/managerController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// Cả Manager và Admin đều có quyền truy cập khu vực kiểm duyệt & vận chuyển sàn
router.use(authenticateToken, authorizeRoles('Manager', 'Admin'));

router.get('/overview', getManagerOverview);

router.get('/shops', getShopsForReview);
router.put('/shops/:id/review', reviewShop);

router.get('/books', getBooksForReview);
router.put('/books/:id/review', reviewBook);
router.put('/books/:id/flash-sale', toggleFlashSale);

router.get('/orders', getAllOrdersForTracking);
router.post('/orders/:id/tracking', addTrackingEvent);

router.get('/disputes', getDisputes);
router.put('/disputes/:id/resolve', resolveDispute);

router.get('/reviews', getReviewsForModeration);
router.put('/reviews/:id', moderateReview);

module.exports = router;
