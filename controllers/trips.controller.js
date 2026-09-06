const pool = require('../config/db');

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

// GET /api/trips/:id
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

    return res.status(200).json({ trip });
  } catch (err) {
    console.error('Get trip by id error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/trips
async function createTrip(req, res) {
  try {
    const { id: userId } = req.user;
    const { title, destination, start_date, end_date, budget, status } = req.body;

    if (!title || !destination || !start_date || !end_date) {
      return res.status(400).json({
        message: 'title, destination, start_date, and end_date are required.',
      });
    }

    const result = await pool.query(
      `INSERT INTO trips (user_id, title, destination, start_date, end_date, budget, status)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'planned'))
       RETURNING *`,
      [userId, title, destination, start_date, end_date, budget || 0, status]
    );

    return res.status(201).json({ message: 'Trip created.', trip: result.rows[0] });
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
    const { title, destination, start_date, end_date, budget, status } = req.body;

    const existing = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    const trip = existing.rows[0];

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found.' });
    }

    // Customers can only edit their own trips; Staff/Admin can edit any trip.
    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    const result = await pool.query(
      `UPDATE trips
       SET title = COALESCE($1, title),
           destination = COALESCE($2, destination),
           start_date = COALESCE($3, start_date),
           end_date = COALESCE($4, end_date),
           budget = COALESCE($5, budget),
           status = COALESCE($6, status)
       WHERE id = $7
       RETURNING *`,
      [title, destination, start_date, end_date, budget, status, id]
    );

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

    // Customers can only delete their own trips; Staff/Admin can delete any trip.
    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    await pool.query('DELETE FROM trips WHERE id = $1', [id]);
    return res.status(200).json({ message: 'Trip deleted.' });
  } catch (err) {
    console.error('Delete trip error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getTrips, getTripById, createTrip, updateTrip, deleteTrip };
