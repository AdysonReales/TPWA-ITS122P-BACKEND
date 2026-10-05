const express = require('express');
const router = express.Router();
const {
  startSession,
  heartbeatSession,
  endSession,
  getSessions,
} = require('../controllers/sessions.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.post('/start', authenticateToken, startSession);
router.post('/heartbeat', authenticateToken, heartbeatSession);
router.post('/end', authenticateToken, endSession);
router.get('/', authenticateToken, authorizeRoles('admin'), getSessions);

module.exports = router;
