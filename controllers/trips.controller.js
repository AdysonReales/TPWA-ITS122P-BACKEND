const pool = require('../config/db');
const { logAction } = require('../utils/logger');
const { recordActivitySafely } = require('../utils/activityLogger');

const VALID_STATUSES = ['planning', 'confirmed', 'ongoing', 'completed', 'cancelled'];
const VALID_VISIBILITIES = ['private', 'friends', 'public'];

function normalizeCountryRoute(value) {
  if (!Array.isArray(value) || value.length > 30) throw new TypeError('country_route must be an array with at most 30 countries.');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('country_route entries must include a countryId and name.');
    const countryId = typeof entry.countryId === 'string' ? entry.countryId.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!countryId || countryId.length > 100 || !name || name.length > 150) throw new TypeError('country_route entries must include a valid countryId and name.');
    return { countryId, name, order: index };
  });
}

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

    // Allow viewing if public or if owner/admin
    if (role === 'customer' && trip.user_id !== userId && trip.visibility !== 'public') {
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
    const { id: userId, role } = req.user;
    const { title, start_date, end_date, total_budget, status, cover_photo, visibility } = req.body;
    let countryRoute;
    try { countryRoute = normalizeCountryRoute(req.body.country_route ?? []); }
    catch (error) { return res.status(400).json({ message: error.message }); }

    if (!title || !start_date || !end_date) {
      return res.status(400).json({ message: 'title, start_date, and end_date are required.' });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const tripStatus = status || 'planning';
    const tripVisibility = (visibility && VALID_VISIBILITIES.includes(visibility)) ? visibility : 'private';

    const result = await pool.query(
      `INSERT INTO trips (user_id, title, start_date, end_date, total_budget, status, cover_photo, visibility, country_route)
       VALUES ($1, $2, $3, $4, $5, $6::trip_status, $7, $8, $9::jsonb)
       RETURNING *`,
      [userId, title, start_date, end_date, total_budget || 0, tripStatus, cover_photo || null, tripVisibility, JSON.stringify(countryRoute)]
    );

    const trip = result.rows[0];
    if (role !== 'customer') {
      logAction({ userId, actionType: 'CREATE_TRIP', tableAffected: 'trips', recordId: trip.id, description: `Created trip "${title}"` });
    }
    await recordActivitySafely({ req, action: 'CREATE_TRIP', entityType: 'trip', entityId: trip.id, details: { status: trip.status } });

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
    const { title, start_date, end_date, total_budget, status, cover_photo, visibility } = req.body;
    let countryRoute = null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'country_route')) {
      try { countryRoute = normalizeCountryRoute(req.body.country_route); }
      catch (error) { return res.status(400).json({ message: error.message }); }
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    
    if (visibility && !VALID_VISIBILITIES.includes(visibility)) {
      return res.status(400).json({ message: `visibility must be one of: ${VALID_VISIBILITIES.join(', ')}` });
    }

    const existing = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    const trip = existing.rows[0];

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found.' });
    }

    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    const result = await pool.query(
      `UPDATE trips
       SET title = COALESCE($1, title),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           total_budget = COALESCE($4, total_budget),
           status = COALESCE($5::trip_status, status),
           cover_photo = COALESCE($6, cover_photo),
           visibility = COALESCE($7, visibility),
           country_route = COALESCE($8::jsonb, country_route)
       WHERE id = $9
       RETURNING *`,
      [
        title ?? null,
        start_date ?? null,
        end_date ?? null,
        total_budget ?? null,
        status ?? null,
        cover_photo ?? null,
        visibility ?? null,
        countryRoute === null ? null : JSON.stringify(countryRoute),
        id,
      ]
    );

    if (role !== 'customer') {
      logAction({ userId, actionType: 'UPDATE_TRIP', tableAffected: 'trips', recordId: id, description: `Updated trip #${id}` });
    }
    await recordActivitySafely({ req, action: 'UPDATE_TRIP', entityType: 'trip', entityId: id, details: { status: result.rows[0].status } });

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
    const deleteReason = req.body && req.body.reason ? `Force deleted trip #${id}: ${req.body.reason}` : `Deleted trip #${id}`;
    if (role !== 'customer') {
      logAction({ userId, actionType: 'DELETE_TRIP', tableAffected: 'trips', recordId: id, description: deleteReason });
    }
    await recordActivitySafely({ req, action: 'DELETE_TRIP', entityType: 'trip', entityId: id });

    return res.status(200).json({ message: 'Trip deleted.' });
  } catch (err) {
    console.error('Delete trip error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}


// Verify trips table has cover_photo and visibility columns
async function initTripColumns() {
  try {
    await pool.query(`
      ALTER TABLE trips
      ADD COLUMN IF NOT EXISTS cover_photo TEXT,
      ADD COLUMN IF NOT EXISTS visibility VARCHAR(50) DEFAULT 'private',
      ADD COLUMN IF NOT EXISTS country_route JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    console.log('Trip columns (cover_photo, visibility) verified.');
  } catch (err) {
    console.error('Failed to verify trip columns:', err);
  }
}

module.exports = { getTrips, getTripById, createTrip, updateTrip, deleteTrip, initTripColumns };
