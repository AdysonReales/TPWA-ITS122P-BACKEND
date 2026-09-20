const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  searchUsers,
  getUserByUsername,
} = require('../controllers/users.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// 1. Public or authenticated search & profile routes
router.get('/search', searchUsers);
router.get('/profile/:username', getUserByUsername);

// 2. Allow logged-in users to update profile details
router.put('/:id', authenticateToken, updateUser);

// 3. Admin-only management routes
router.get('/', authenticateToken, authorizeRoles('admin'), getAllUsers);
router.get('/:id', authenticateToken, authorizeRoles('admin'), getUserById);
router.post('/', authenticateToken, authorizeRoles('admin'), createUser);
router.delete('/:id', authenticateToken, authorizeRoles('admin'), deleteUser);

module.exports = router;