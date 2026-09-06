const express = require('express');
const router = express.Router();
const { getLogs } = require('../controllers/logs.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.get('/', authenticateToken, authorizeRoles('admin'), getLogs);

module.exports = router;
