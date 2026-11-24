const express = require('express');
const router = express.Router();
const {
  getEligibleOrdersForBook,
  createReview,
  replyReview,
  reportReview,
} = require('../controllers/reviewController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/eligible/:bookId', getEligibleOrdersForBook);
router.post('/', createReview);
router.put('/:id/reply', replyReview);
router.put('/:id/report', reportReview);

module.exports = router;
