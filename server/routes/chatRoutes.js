const express = require('express');
const router = express.Router();
const {
  getConversations,
  startOrGetConversation,
  getMessages,
  sendMessage,
} = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/conversations', getConversations);
router.post('/conversations', startOrGetConversation);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);

module.exports = router;
