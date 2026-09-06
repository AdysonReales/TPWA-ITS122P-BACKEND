const express = require('express');
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categories.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// Anyone logged in can browse categories; only admin/staff manage the catalog.
router.get('/', authenticateToken, getCategories);
router.post('/', authenticateToken, authorizeRoles('admin', 'staff'), createCategory);
router.put('/:id', authenticateToken, authorizeRoles('admin', 'staff'), updateCategory);
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'staff'), deleteCategory);

module.exports = router;
