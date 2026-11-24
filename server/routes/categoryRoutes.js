const express = require('express');
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.get('/', getCategories);
router.post('/', authenticateToken, authorizeRoles('Admin'), createCategory);
router.put('/:id', authenticateToken, authorizeRoles('Admin'), updateCategory);
router.delete('/:id', authenticateToken, authorizeRoles('Admin'), deleteCategory);

module.exports = router;

