const pool = require('../config/db');
const { logAction } = require('../utils/logger');

const VALID_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

// GET /api/bookings  (optional ?status=pending for the staff queue)
// Customers see only their own bookings. Vendors see bookings for their own activities.
// Staff/Admin see everything.
async function getBookings(req, res) {
  try {
    const { id: userId, role } = req.user;
    const { status } = req.query;

    let text;
    const values = [];

    if (role === 'customer') {
      values.push(userId);
      text = 'SELECT * FROM bookings WHERE user_id = $1';
    } else if (role === 'vendor') {
      values.push(userId);
      text = `SELECT b.* FROM bookings b
              JOIN activities a ON a.id = b.activity_id
              JOIN vendor_profiles v ON v.id = a.vendor_id
              WHERE v.user_id = $1`;
    } else {
      text = 'SELECT * FROM bookings';
    }

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      values.push(status);
      text += values.length === 1 ? ' WHERE' : ' AND';
      text += ` status = $${values.length}`;
    }

    text += ' ORDER BY submitted_at DESC';

    const result = await pool.query(text, values);
    return res.status(200).json({ bookings: result.rows });
  } catch (err) {
    console.error('Get bookings error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/bookings  (customer submits a request; status starts as Pending)
async function createBooking(req, res) {
  try {
    const { id: userId } = req.user;
    const { activity_id } = req.body;

    if (!activity_id) {
      return res.status(400).json({ message: 'activity_id is required.' });
    }

    const activityCheck = await pool.query('SELECT id FROM activities WHERE id = $1', [activity_id]);
    if (activityCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Activity not found.' });
    }

    const result = await pool.query(
      `INSERT INTO bookings (user_id, activity_id, status)
       VALUES ($1, $2, 'pending') RETURNING *`,
      [userId, activity_id]
    );

    const booking = result.rows[0];
    logAction({ userId, actionType: 'CREATE_BOOKING', tableAffected: 'bookings', recordId: booking.id, description: `Submitted booking for activity #${activity_id}` });

    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Booking Submitted', 'Your booking request has been submitted and is pending approval.', 'booking')`,
      [userId]
    );

    return res.status(201).json({ message: 'Booking submitted.', booking });
  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/bookings/:id  (staff/admin confirm or reject; used for the approval workflow)
async function updateBookingStatus(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const { status, rejection_reason } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const existing = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    const result = await pool.query(
      'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    const booking = result.rows[0];

    logAction({ userId, actionType: 'UPDATE_BOOKING', tableAffected: 'bookings', recordId: id, description: `Booking #${id} set to ${status}` });

    const notifMessage =
      status === 'confirmed'
        ? 'Your booking has been confirmed!'
        : status === 'cancelled'
        ? `Your booking was rejected.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`
        : `Your booking status is now: ${status}.`;

    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Booking Update', $2, 'booking')`,
      [booking.user_id, notifMessage]
    );

    return res.status(200).json({ message: 'Booking updated.', booking });
  } catch (err) {
    console.error('Update booking error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getBookings, createBooking, updateBookingStatus };
