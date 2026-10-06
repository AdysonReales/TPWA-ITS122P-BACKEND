const express = require('express');
const router = express.Router();
const { getActivity } = require('../controllers/activity.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.get('/', authenticateToken, authorizeRoles('admin'), getActivity);

module.exports = router;
