const express = require('express');
const router = express.Router();
const { getReports } = require('../controllers/admin.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// Only allow Admins to access these aggregate system reports
router.get('/reports', authenticateToken, authorizeRoles('admin'), getReports);

module.exports = router;