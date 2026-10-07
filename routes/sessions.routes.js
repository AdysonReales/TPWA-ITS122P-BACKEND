const express = require('express');
const router = express.Router();
const {
  startVisit,
  heartbeatVisit,
  getSessions,
  getSessionActions,
  getSessionMetrics,
} = require('../controllers/sessions.controller');
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.post('/start', optionalAuthenticateToken, startVisit);
router.post('/heartbeat', optionalAuthenticateToken, heartbeatVisit);
router.get('/', authenticateToken, authorizeRoles('admin'), getSessions);
router.get('/metrics', authenticateToken, authorizeRoles('admin'), getSessionMetrics);
router.get('/:id/actions', authenticateToken, authorizeRoles('admin'), getSessionActions);

module.exports = router;
