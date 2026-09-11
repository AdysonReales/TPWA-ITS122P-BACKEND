const pool = require('../config/db');
const { logAction } = require('../utils/logger');

const VALID_STATUSES = ['planning', 'confirmed', 'ongoing', 'completed', 'cancelled'];

// GET /api/trips
// Customers see only their own trips. Staff/Admin see everyone's trips.
async function getTrips(req, res) {
  try {
    const { id: userId, role } = req.user;

    const query =
      role === 'customer'
        ? { text: 'SELECT * FROM trips WHERE user_id = $1 ORDER BY start_date ASC', values: [userId] }
        : { text: 'SELECT * FROM trips ORDER BY start_date ASC', values: [] };

    const result = await pool.query(query.text, query.values);
    return res.status(200).json({ trips: result.rows });
  } catch (err) {
    console.error('Get trips error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// GET /api/trips/:id  (includes its destinations)
async function getTripById(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    const result = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    const trip = result.rows[0];

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found.' });
    }

    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    const destinations = await pool.query(
      'SELECT * FROM destinations WHERE trip_id = $1 ORDER BY order_sequence ASC',
      [id]
    );

    return res.status(200).json({ trip: { ...trip, destinations: destinations.rows } });
  } catch (err) {
    console.error('Get trip by id error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/trips
async function createTrip(req, res) {
  try {
    const { id: userId } = req.user;
    const { title, start_date, end_date, total_budget, status } = req.body;

    if (!title || !start_date || !end_date) {
      return res.status(400).json({ message: 'title, start_date, and end_date are required.' });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const tripStatus = status || 'planning';

    // Cast $6 explicitly to ::trip_status so PostgreSQL accepts the string parameter
    const result = await pool.query(
      `INSERT INTO trips (user_id, title, start_date, end_date, total_budget, status)
       VALUES ($1, $2, $3, $4, $5, $6::trip_status)
       RETURNING *`,
      [userId, title, start_date, end_date, total_budget || 0, tripStatus]
    );

    const trip = result.rows[0];
    logAction({ userId, actionType: 'CREATE_TRIP', tableAffected: 'trips', recordId: trip.id, description: `Created trip "${title}"` });

    return res.status(201).json({ message: 'Trip created.', trip });
  } catch (err) {
    console.error('Create trip error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/trips/:id
async function updateTrip(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const { title, start_date, end_date, total_budget, status } = req.body;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const existing = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    const trip = existing.rows[0];

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found.' });
    }

    // Customers can only edit their own trips; Staff/Admin can edit any trip.
    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    // Cast $5 to ::trip_status to match PostgreSQL enum
    const result = await pool.query(
      `UPDATE trips
       SET title = COALESCE($1, title),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           total_budget = COALESCE($4, total_budget),
           status = COALESCE($5::trip_status, status)
       WHERE id = $6
       RETURNING *`,
      [
        title ?? null,
        start_date ?? null,
        end_date ?? null,
        total_budget ?? null,
        status ?? null,
        id,
      ]
    );

    logAction({ userId, actionType: 'UPDATE_TRIP', tableAffected: 'trips', recordId: id, description: `Updated trip #${id}` });

    return res.status(200).json({ message: 'Trip updated.', trip: result.rows[0] });
  } catch (err) {
    console.error('Update trip error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// DELETE /api/trips/:id
async function deleteTrip(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    const existing = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    const trip = existing.rows[0];

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found.' });
    }

    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    await pool.query('DELETE FROM trips WHERE id = $1', [id]);
    logAction({ userId, actionType: 'DELETE_TRIP', tableAffected: 'trips', recordId: id, description: `Deleted trip #${id}` });

    return res.status(200).json({ message: 'Trip deleted.' });
  } catch (err) {
    console.error('Delete trip error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getTrips, getTripById, createTrip, updateTrip, deleteTrip };
