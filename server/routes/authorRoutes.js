const express = require('express');
const router = express.Router();
const {
  getAuthors,
  createAuthor,
  updateAuthor,
  deleteAuthor,
} = require('../controllers/authorController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.get('/', getAuthors);
router.post('/', authenticateToken, authorizeRoles('Admin'), createAuthor);
router.put('/:id', authenticateToken, authorizeRoles('Admin'), updateAuthor);
router.delete('/:id', authenticateToken, authorizeRoles('Admin'), deleteAuthor);

module.exports = router;

