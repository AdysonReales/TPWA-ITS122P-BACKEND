const express = require('express');
const router = express.Router();
const {
  getSessions,
  getSessionActions,
  getSessionMetrics,
} = require('../controllers/sessions.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.get('/', authenticateToken, authorizeRoles('admin'), getSessions);
router.get('/metrics', authenticateToken, authorizeRoles('admin'), getSessionMetrics);
router.get('/:id/actions', authenticateToken, authorizeRoles('admin'), getSessionActions);

module.exports = router;
