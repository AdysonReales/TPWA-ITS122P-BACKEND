const express = require('express');
const router = express.Router();
const { createActivity, getActivity } = require('../controllers/activity.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.post('/', authenticateToken, createActivity);
router.get('/', authenticateToken, authorizeRoles('admin'), getActivity);

module.exports = router;
