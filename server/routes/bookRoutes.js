const express = require('express');
const router = express.Router();
const { getBooks, getBookById, createBook, updateBook, deleteBook } = require('../controllers/bookController');
const {
  getBookQuestions,
  askBookQuestion,
  answerBookQuestion,
  deleteBookQuestion,
} = require('../controllers/questionController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// Hỏi đáp sản phẩm (Q&A)
router.put('/questions/:questionId/answer', authenticateToken, answerBookQuestion);
router.delete('/questions/:questionId', authenticateToken, deleteBookQuestion);

router.get('/', getBooks);
router.get('/:id/questions', getBookQuestions);
router.post('/:id/questions', authenticateToken, askBookQuestion);
router.get('/:id', getBookById);
router.post('/', authenticateToken, authorizeRoles('Admin', 'Manager'), createBook);
router.put('/:id', authenticateToken, authorizeRoles('Admin', 'Manager'), updateBook);
router.delete('/:id', authenticateToken, authorizeRoles('Admin'), deleteBook);

module.exports = router;
