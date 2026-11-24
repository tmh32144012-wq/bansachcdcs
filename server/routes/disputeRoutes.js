const express = require('express');
const router = express.Router();
const { createDispute, getMyDisputes } = require('../controllers/disputeController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.post('/', createDispute);
router.get('/my', getMyDisputes);

module.exports = router;
