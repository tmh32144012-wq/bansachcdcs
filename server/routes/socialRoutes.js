const express = require('express');
const router = express.Router();
const {
  toggleFollowShop,
  getFollowedShops,
  toggleWishlist,
  getWishlist,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  issueSseTicket,
  streamEvents,
} = require('../controllers/socialController');
const { authenticateToken } = require('../middleware/authMiddleware');

// SSE Realtime Stream (xác thực qua ticket dùng 1 lần)
router.get('/stream', streamEvents);

router.use(authenticateToken);

router.post('/sse-ticket', issueSseTicket);

router.post('/follow-shop/:shopId', toggleFollowShop);
router.get('/followed-shops', getFollowedShops);

router.post('/wishlist/:bookId', toggleWishlist);
router.get('/wishlist', getWishlist);

router.get('/notifications', getNotifications);
router.put('/notifications/:id/read', markNotificationRead);
router.put('/notifications/read-all', markAllNotificationsRead);

module.exports = router;
