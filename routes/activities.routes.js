const express = require('express');
const router = express.Router();
const {
  getActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
} = require('../controllers/activities.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// Everyone logged in can browse activities; only vendor/staff/admin manage them.
router.get('/', authenticateToken, getActivities);
router.get('/:id', authenticateToken, getActivityById);
router.post('/', authenticateToken, authorizeRoles('admin', 'staff', 'vendor'), createActivity);
router.put('/:id', authenticateToken, authorizeRoles('admin', 'staff', 'vendor'), updateActivity);
router.delete('/:id', authenticateToken, authorizeRoles('admin', 'staff', 'vendor'), deleteActivity);

module.exports = router;
