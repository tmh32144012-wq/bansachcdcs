const express = require('express');
const router = express.Router();
const { getPublicShops, getShopById } = require('../controllers/shopController');
const { optionalAuth } = require('../middleware/authMiddleware');

router.get('/', getPublicShops);
router.get('/:id', optionalAuth, getShopById);

module.exports = router;
