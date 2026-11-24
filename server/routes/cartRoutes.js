const express = require('express');
const router = express.Router();
const { getCart, syncCart, clearServerCart } = require('../controllers/cartController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/', getCart);
router.put('/sync', syncCart);
router.delete('/', clearServerCart);

module.exports = router;
