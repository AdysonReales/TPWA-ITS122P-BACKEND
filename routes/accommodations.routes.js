const express = require('express');
const router = express.Router();
const { getAccommodations, getAccommodationById } = require('../controllers/accommodations.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(authenticateToken, authorizeRoles('admin', 'staff', 'customer'));
router.get('/', getAccommodations);
router.get('/:id', getAccommodationById);

module.exports = router;
