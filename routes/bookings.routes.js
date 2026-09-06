const express = require('express');
const router = express.Router();
const { getBookings, createBooking, updateBookingStatus } = require('../controllers/bookings.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// Everyone logged in can see their relevant bookings; only customers create;
// only staff/admin confirm or reject.
router.get('/', authenticateToken, authorizeRoles('admin', 'staff', 'customer', 'vendor'), getBookings);
router.post('/', authenticateToken, authorizeRoles('customer'), createBooking);
router.put('/:id', authenticateToken, authorizeRoles('admin', 'staff'), updateBookingStatus);

module.exports = router;
