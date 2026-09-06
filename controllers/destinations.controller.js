const pool = require('../config/db');

// Shared helper: fetch a trip and verify the requesting user may modify it.
async function getAccessibleTrip(tripId, user) {
  const result = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
  const trip = result.rows[0];
  if (!trip) return { trip: null, allowed: false };
  const allowed = user.role !== 'customer' || trip.user_id === user.id;
  return { trip, allowed };
}

// GET /api/destinations?trip_id=1
async function getDestinations(req, res) {
  try {
    const { trip_id } = req.query;
    if (!trip_id) {
      return res.status(400).json({ message: 'trip_id query parameter is required.' });
    }

    const { trip, allowed } = await getAccessibleTrip(trip_id, req.user);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this trip.' });

    const result = await pool.query(
      'SELECT * FROM destinations WHERE trip_id = $1 ORDER BY order_sequence ASC',
      [trip_id]
    );
    return res.status(200).json({ destinations: result.rows });
  } catch (err) {
    console.error('Get destinations error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// GET /api/destinations/:id
async function getDestinationById(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM destinations WHERE id = $1', [id]);
    const destination = result.rows[0];
    if (!destination) return res.status(404).json({ message: 'Destination not found.' });

    const { allowed } = await getAccessibleTrip(destination.trip_id, req.user);
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this destination.' });

    return res.status(200).json({ destination });
  } catch (err) {
    console.error('Get destination by id error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/destinations
async function createDestination(req, res) {
  try {
    const { trip_id, location_name, latitude, longitude, order_sequence } = req.body;

    if (!trip_id || !location_name) {
      return res.status(400).json({ message: 'trip_id and location_name are required.' });
    }

    const { trip, allowed } = await getAccessibleTrip(trip_id, req.user);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this trip.' });

    const result = await pool.query(
      `INSERT INTO destinations (trip_id, location_name, latitude, longitude, order_sequence)
       VALUES ($1, $2, $3, $4, COALESCE($5, 1))
       RETURNING *`,
      [trip_id, location_name, latitude, longitude, order_sequence]
    );

    return res.status(201).json({ message: 'Destination added.', destination: result.rows[0] });
  } catch (err) {
    console.error('Create destination error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/destinations/:id
async function updateDestination(req, res) {
  try {
    const { id } = req.params;
    const { location_name, latitude, longitude, order_sequence } = req.body;

    const existing = await pool.query('SELECT * FROM destinations WHERE id = $1', [id]);
    const destination = existing.rows[0];
    if (!destination) return res.status(404).json({ message: 'Destination not found.' });

    const { allowed } = await getAccessibleTrip(destination.trip_id, req.user);
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this destination.' });

    const result = await pool.query(
      `UPDATE destinations
       SET location_name = COALESCE($1, location_name),
           latitude = COALESCE($2, latitude),
           longitude = COALESCE($3, longitude),
           order_sequence = COALESCE($4, order_sequence)
       WHERE id = $5
       RETURNING *`,
      [location_name, latitude, longitude, order_sequence, id]
    );

    return res.status(200).json({ message: 'Destination updated.', destination: result.rows[0] });
  } catch (err) {
    console.error('Update destination error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// DELETE /api/destinations/:id
async function deleteDestination(req, res) {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT * FROM destinations WHERE id = $1', [id]);
    const destination = existing.rows[0];
    if (!destination) return res.status(404).json({ message: 'Destination not found.' });

    const { allowed } = await getAccessibleTrip(destination.trip_id, req.user);
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this destination.' });

    await pool.query('DELETE FROM destinations WHERE id = $1', [id]);
    return res.status(200).json({ message: 'Destination deleted.' });
  } catch (err) {
    console.error('Delete destination error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = {
  getDestinations,
  getDestinationById,
  createDestination,
  updateDestination,
  deleteDestination,
};
