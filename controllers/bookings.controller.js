const pool = require('../config/db');
const { logAction } = require('../utils/logger');
const { normalizeCountry, normalizeArea, getDestinationLocation } = require('../utils/accommodationLocation');

// Normalizing helpers between Postgres Title-Case enum ('Pending', 'Confirmed'...)
// and public API lowercase contract ('pending', 'confirmed'...)
const toDbStatus = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const toApiStatus = (s) => (s ? s.toLowerCase() : 'pending');
const normalizeBookingRow = (row) => (row ? { ...row, status: toApiStatus(row.status) } : row);

const VALID_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

async function initBookingsTable() {
  try {
    await pool.query(`
      ALTER TABLE bookings ALTER COLUMN activity_id DROP NOT NULL;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS destination_id INTEGER REFERENCES destinations(id) ON DELETE SET NULL;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_title VARCHAR(150);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_type VARCHAR(50);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_location VARCHAR(150);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_date TIMESTAMPTZ;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cost DECIMAL(10, 2);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
      UPDATE bookings SET submitted_at = COALESCE(booking_date, CURRENT_TIMESTAMP) WHERE submitted_at IS NULL;

      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'destinations' AND column_name = 'locationname'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'destinations' AND column_name = 'location_name'
        ) THEN
          ALTER TABLE destinations RENAME COLUMN locationname TO location_name;
        END IF;
      END $$;
    `);
    console.log('Bookings table verified and extended.');
  } catch (err) {
    console.warn('Bookings table extension notice:', err.message);
  }
}

// GET /api/bookings  (optional ?status=pending for the staff queue)
// Customers see only their own bookings. Vendors see bookings for their own activities.
// Staff/Admin see everything.
async function getBookings(req, res) {
  try {
    const { id: userId, role } = req.user;
    const { status, trip_id } = req.query;

    let text;
    const values = [];

    const baseSelect = `
      SELECT b.*, 
             u.full_name AS customer_name, 
             u.email AS customer_email,
             COALESCE(b.custom_title, a.title) AS activity_title,
             COALESCE(b.cost, a.cost) AS resolved_cost,
             COALESCE(b.custom_type, 'activity') AS resolved_type,
             COALESCE(b.custom_location, d.location_name) AS resolved_location,
             h.name AS accommodation_name, h.area AS accommodation_area,
             t.title AS trip_title
      FROM bookings b 
      LEFT JOIN users u ON u.id = b.user_id 
      LEFT JOIN activities a ON a.id = b.activity_id 
      LEFT JOIN accommodations h ON h.id = b.accommodation_id
      LEFT JOIN destinations d ON d.id = COALESCE(b.destination_id, a.destination_id)
      LEFT JOIN trips t ON t.id = COALESCE(b.trip_id, d.trip_id)
    `;

    if (role === 'customer') {
      values.push(userId);
      text = `${baseSelect} WHERE b.user_id = $1`;
    } else if (role === 'vendor') {
      values.push(userId);
      text = `${baseSelect}
              LEFT JOIN vendor_profiles v ON v.id = a.vendor_id
              WHERE v.user_id = $1`;
    } else {
      text = baseSelect;
    }

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      values.push(toDbStatus(status));
      text += values.length === 1 ? ' WHERE' : ' AND';
      text += ` b.status = $${values.length}`;
    }

    if (trip_id) {
      values.push(trip_id);
      text += values.length === 1 ? ' WHERE' : ' AND';
      text += ` (b.trip_id = $${values.length} OR d.trip_id = $${values.length})`;
    }

    text += ' ORDER BY COALESCE(b.submitted_at, b.booking_date) DESC, b.id DESC';

    const result = await pool.query(text, values);
    return res.status(200).json({ bookings: result.rows.map(normalizeBookingRow) });
  } catch (err) {
    console.error('Get bookings error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/bookings  (customer submits a request; status starts as Pending)
async function createBooking(req, res) {
  try {
    const { id: userId } = req.user;
    const {
      trip_id,
      destination_id,
      accommodation_id,
      booking_date,
      notes,
    } = req.body;

    if (!accommodation_id || !destination_id || !trip_id) return res.status(400).json({ message: 'trip_id, destination_id, and accommodation_id are required.' });
    const destinationId = Number(destination_id);
    const accommodationId = Number(accommodation_id);
    const tripId = Number(trip_id);
    if (!Number.isSafeInteger(destinationId) || !Number.isSafeInteger(accommodationId) || !Number.isSafeInteger(tripId)) {
      return res.status(400).json({ message: 'destination_id, accommodation_id, and trip_id must be integers.' });
    }
    const accommodationResult = await pool.query(
      `SELECT a.id, a.country AS accommodation_country, a.area AS accommodation_area,
              a.name, a.price, d.country AS destination_country,
              d.location_name, d.accommodation_id AS destination_accommodation_id,
              d.trip_id, t.user_id AS trip_owner_id
       FROM accommodations a
       JOIN destinations d ON d.id = $2
       JOIN trips t ON t.id = d.trip_id
       WHERE a.id = $1 AND d.trip_id = $3 AND t.user_id = $4 AND a.is_active = TRUE`,
      [accommodationId, destinationId, tripId, userId]
    );
    if (!accommodationResult.rows[0]) return res.status(400).json({ message: 'Destination does not belong to this trip, or accommodation is unavailable.' });
    const accommodation = accommodationResult.rows[0];
    if (
      accommodation.destination_accommodation_id !== null &&
      accommodation.destination_accommodation_id !== undefined &&
      Number(accommodation.destination_accommodation_id) !== accommodationId
    ) {
      return res.status(422).json({
        code: 'DESTINATION_ACCOMMODATION_MISMATCH',
        message: 'Selected accommodation does not match the property planned for this destination.',
      });
    }
    const destinationLocation = getDestinationLocation({ country: accommodation.destination_country, location_name: accommodation.location_name });
    if (!destinationLocation.country || !destinationLocation.area) {
      return res.status(422).json({ message: 'Trip destination must include a country and area before booking.' });
    }
    if (normalizeCountry(accommodation.accommodation_country) !== destinationLocation.country || normalizeArea(accommodation.accommodation_area) !== normalizeArea(destinationLocation.area)) {
      return res.status(400).json({ message: 'Selected accommodation country and area do not match the trip destination.' });
    }
    if (accommodation.price === null || accommodation.price === undefined) {
      return res.status(422).json({
        code: 'ACCOMMODATION_PRICE_DATA_REQUIRED',
        message: 'ACCOMMODATION PRICE DATA REQUIRED',
        accommodations: [{ id: accommodation.id, country: accommodation.accommodation_country, area: accommodation.accommodation_area, name: accommodation.name }],
      });
    }

    const result = await pool.query(
      `INSERT INTO bookings (
        user_id, status, trip_id, destination_id, accommodation_id,
        custom_title, custom_type, booking_date, cost, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'accommodation', $7, $8, $9)
       RETURNING *`,
      [
        userId,
        toDbStatus('pending'),
        tripId,
        destinationId,
        accommodationId,
        accommodation.name,
        booking_date || null,
        accommodation.price,
        notes ? notes.trim() : null,
      ]
    );

    const booking = normalizeBookingRow(result.rows[0]);
    const bookingTitle = accommodation.name;
    logAction({
      userId,
      actionType: 'CREATE_BOOKING',
      tableAffected: 'bookings',
      recordId: booking.id,
      description: `Submitted booking for "${bookingTitle}"`,
    });

    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Booking Submitted', 'Your booking request has been submitted and is pending approval.', 'Booking')`,
      [userId]
    );

    return res.status(201).json({ message: 'Booking submitted.', booking });
  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/bookings/:id  (staff/admin confirm, reject, or assign/update price)
async function updateBookingStatus(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const { status, rejection_reason } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const existing = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    const currentBooking = existing.rows[0];
    const newStatus = status ? toDbStatus(status) : currentBooking.status;
    if (String(currentBooking.status).toLowerCase() !== 'pending' || !['confirmed', 'cancelled'].includes(String(newStatus).toLowerCase())) {
      return res.status(409).json({ message: 'Only Pending bookings can be changed to Confirmed or Cancelled.' });
    }
    const newCost = currentBooking.cost;
    const newReason = rejection_reason !== undefined ? rejection_reason : currentBooking.rejection_reason;

    const result = await pool.query(
      `UPDATE bookings 
       SET status = $1, cost = $2, rejection_reason = $3
       WHERE id = $4 AND status = $5
       RETURNING *`,
      [newStatus, newCost, newReason, id, currentBooking.status]
    );
    if (!result.rows[0]) return res.status(409).json({ message: 'Booking status changed before this update. Refresh and try again.' });
    const booking = normalizeBookingRow(result.rows[0]);

    logAction({
      userId,
      actionType: 'BOOKING_STATUS_CHANGED',
      tableAffected: 'bookings',
      recordId: id,
      description: `booking.status_changed previous=${String(currentBooking.status).toLowerCase()} new=${booking.status}`,
    });

    const notifMessage =
      booking.status === 'confirmed'
        ? `Your booking has been confirmed!${newCost ? ` Confirmed cost: ₱${newCost}` : ''}`
        : booking.status === 'cancelled'
        ? `Your booking was rejected.${newReason ? ' Reason: ' + newReason : ''}`
        : `Your booking status is now: ${booking.status}.`;

    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Booking Update', $2, 'Booking')`,
      [booking.user_id, notifMessage]
    );

    return res.status(200).json({ message: 'Booking updated.', booking });
  } catch (err) {
    console.error('Update booking error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { initBookingsTable, getBookings, createBooking, updateBookingStatus };

