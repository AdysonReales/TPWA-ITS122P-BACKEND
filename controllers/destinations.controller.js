const pool = require('../config/db');
const { resolveLocation } = require('../utils/locationResolver');
const { normalizeCountry, normalizeArea } = require('../utils/accommodationLocation');
const { recordActivitySafely } = require('../utils/activityLogger');

async function validateAccommodationForLocation(accommodationId, location) {
  const id = Number(accommodationId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { error: { status: 400, code: 'INVALID_ACCOMMODATION_ID', message: 'accommodation_id must be a positive integer.' } };
  }

  const result = await pool.query(
    'SELECT id, country, area, name, is_active FROM accommodations WHERE id = $1',
    [id]
  );
  const accommodation = result.rows[0];
  if (!accommodation) {
    return { error: { status: 404, code: 'ACCOMMODATION_NOT_FOUND', message: 'Accommodation was not found.' } };
  }
  if (!accommodation.is_active) {
    return { error: { status: 409, code: 'ACCOMMODATION_NOT_AVAILABLE', message: 'Accommodation is not active.' } };
  }
  if (
    normalizeCountry(accommodation.country) !== normalizeCountry(location.country) ||
    normalizeArea(accommodation.area) !== normalizeArea(location.area)
  ) {
    return { error: { status: 422, code: 'ACCOMMODATION_LOCATION_MISMATCH', message: 'Accommodation country and area must match the destination.' } };
  }
  return { accommodation };
}

function sendAccommodationError(res, error) {
  return res.status(error.status).json({ code: error.code, message: error.message });
}

async function initDestinationsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS destinations (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        location_name VARCHAR(150) NOT NULL,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        order_sequence INTEGER NOT NULL DEFAULT 1,
        accommodation_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_destinations_trip ON destinations(trip_id);
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS country VARCHAR(150);
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS region VARCHAR(150);
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS parent_destination_id INTEGER REFERENCES destinations(id) ON DELETE CASCADE;
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS days INTEGER DEFAULT 1;
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS accommodation TEXT;
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS accommodation_id INTEGER;
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS activities TEXT;
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS transportation TEXT;

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
    try {
      await pool.query("SELECT setval(pg_get_serial_sequence('destinations', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM destinations;");
    } catch (seqErr) {
      console.warn('Sequence sync warning:', seqErr.message);
    }
    console.log('Destinations table and sequence verified.');
  } catch (err) {
    console.error('Failed to verify destinations table:', err);
  }
}


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
      'SELECT * FROM destinations WHERE trip_id = $1 ORDER BY order_sequence ASC, id ASC',
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
    const {
      trip_id,
      location_name,
      order_sequence,
      country,
      region_hint,
      accommodation_id,
      parent_destination_id,
      days,
      accommodation,
      activities,
      transportation,
    } = req.body;

    if (!trip_id || !location_name || !country) {
      return res.status(400).json({ message: 'trip_id, country, and location_name are required.' });
    }

    const { trip, allowed } = await getAccessibleTrip(trip_id, req.user);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this trip.' });

    const resolution = await resolveLocation(country, location_name, region_hint);
    if (resolution.status === 'ambiguous') {
      return res.status(409).json({ code: 'LOCATION_AMBIGUOUS', message: 'Select the matching region for this location.', candidates: resolution.candidates });
    }
    if (resolution.status !== 'resolved') {
      return res.status(422).json({ code: 'LOCATION_NOT_FOUND', message: `Location not found in the open reference dataset: ${country} / ${location_name}.` });
    }
    const canonical = resolution.location;

    let destinationAccommodationId = null;
    let accommodationText = accommodation ?? null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'accommodation_id')) {
      if (accommodation_id === null) {
        accommodationText = null;
      } else {
        const selection = await validateAccommodationForLocation(accommodation_id, canonical);
        if (selection.error) return sendAccommodationError(res, selection.error);
        destinationAccommodationId = selection.accommodation.id;
        accommodationText = selection.accommodation.name;
      }
    }

    const result = await pool.query(
      `INSERT INTO destinations (
        trip_id, location_name, latitude, longitude, order_sequence,
        country, country_code, region, parent_destination_id, days,
        accommodation_id, accommodation, activities, transportation
       )
       VALUES ($1, $2, $3, $4, COALESCE($5, 1), $6, $7, $8, $9, COALESCE($10, 1), $11, $12, $13, $14)
       RETURNING *`,
      [
        trip_id,
        canonical.area,
        canonical.latitude,
        canonical.longitude,
        order_sequence ?? 1,
        canonical.country,
        canonical.country_code,
        canonical.region,
        parent_destination_id ?? null,
        days ?? 1,
        destinationAccommodationId,
        accommodationText,
        activities ?? null,
        transportation ?? null,
      ]
    );

    await recordActivitySafely({
      req,
      action: 'ADD_DESTINATION',
      entityType: 'destination',
      entityId: result.rows[0].id,
      details: { tripId: result.rows[0].trip_id },
    });
    if (destinationAccommodationId !== null) {
      await recordActivitySafely({
        req,
        action: 'SELECT_ACCOMMODATION',
        entityType: 'accommodation',
        entityId: destinationAccommodationId,
        details: { destinationId: result.rows[0].id },
      });
    }

    return res.status(201).json({
      message: 'Destination added.',
      destination: result.rows[0],
      location: canonical,
      ...(canonical.latitude === null || canonical.longitude === null ? { warnings: ['OPEN LOCATION COORDINATES MISSING'] } : {}),
    });
  } catch (err) {
    console.error('Create destination error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/destinations/:id
async function updateDestination(req, res) {
  try {
    const { id } = req.params;
    const {
      location_name,
      order_sequence,
      country,
      region_hint,
      accommodation_id,
      parent_destination_id,
      days,
      accommodation,
      activities,
      transportation,
    } = req.body;

    const existing = await pool.query('SELECT * FROM destinations WHERE id = $1', [id]);
    const destination = existing.rows[0];
    if (!destination) return res.status(404).json({ message: 'Destination not found.' });

    const { allowed } = await getAccessibleTrip(destination.trip_id, req.user);
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this destination.' });

    let canonical = null;
    if (location_name !== undefined || country !== undefined) {
      const requestedCountry = country ?? destination.country;
      const requestedArea = location_name ?? destination.location_name;
      if (!requestedCountry || !requestedArea) {
        return res.status(400).json({ message: 'country and location_name are required to resolve an updated location.' });
      }
      const resolution = await resolveLocation(requestedCountry, requestedArea, region_hint ?? destination.region);
      if (resolution.status === 'ambiguous') {
        return res.status(409).json({ code: 'LOCATION_AMBIGUOUS', message: 'Select the matching region for this location.', candidates: resolution.candidates });
      }
      if (resolution.status !== 'resolved') {
        return res.status(422).json({ code: 'LOCATION_NOT_FOUND', message: `Location not found in the open reference dataset: ${requestedCountry} / ${requestedArea}.` });
      }
      canonical = resolution.location;
    }

    const locationChanged = Boolean(canonical) && (
      normalizeCountry(canonical.country) !== normalizeCountry(destination.country) ||
      normalizeArea(canonical.area) !== normalizeArea(destination.location_name)
    );
    const accommodationIdProvided = Object.prototype.hasOwnProperty.call(req.body, 'accommodation_id');
    let nextAccommodationId = destination.accommodation_id ?? null;
    let nextAccommodationText = destination.accommodation ?? null;

    if (accommodationIdProvided && accommodation_id === null) {
      nextAccommodationId = null;
      nextAccommodationText = null;
    } else if (accommodationIdProvided) {
      let destinationLocation = canonical;
      if (!destinationLocation) {
        const resolution = await resolveLocation(destination.country, destination.location_name, destination.region);
        if (resolution.status === 'ambiguous') {
          return res.status(409).json({ code: 'LOCATION_AMBIGUOUS', message: 'Select the matching region for this location.', candidates: resolution.candidates });
        }
        if (resolution.status !== 'resolved') {
          return res.status(422).json({ code: 'LOCATION_NOT_FOUND', message: `Location not found in the open reference dataset: ${destination.country} / ${destination.location_name}.` });
        }
        destinationLocation = resolution.location;
      }
      const selection = await validateAccommodationForLocation(accommodation_id, destinationLocation);
      if (selection.error) return sendAccommodationError(res, selection.error);
      nextAccommodationId = selection.accommodation.id;
      nextAccommodationText = selection.accommodation.name;
    } else if (locationChanged) {
      if (destination.accommodation_id !== null && destination.accommodation_id !== undefined) {
        const selection = await validateAccommodationForLocation(destination.accommodation_id, canonical);
        if (selection.error) {
          nextAccommodationId = null;
          nextAccommodationText = null;
        } else {
          nextAccommodationId = selection.accommodation.id;
          nextAccommodationText = selection.accommodation.name;
        }
      } else {
        // Legacy free-text choices cannot be verified against the new area.
        nextAccommodationId = null;
        nextAccommodationText = null;
      }
    } else if (nextAccommodationId === null && accommodation !== undefined) {
      // Preserve old clients that still save accommodation labels without IDs.
      nextAccommodationText = accommodation ?? null;
    }

    const result = await pool.query(
      `UPDATE destinations
       SET location_name = CASE WHEN $13 THEN $1 ELSE location_name END,
           latitude = CASE WHEN $13 THEN $2 ELSE latitude END,
           longitude = CASE WHEN $13 THEN $3 ELSE longitude END,
           order_sequence = COALESCE($4, order_sequence),
           country = CASE WHEN $13 THEN $5 ELSE country END,
           country_code = CASE WHEN $13 THEN $6 ELSE country_code END,
           region = CASE WHEN $13 THEN $7 ELSE region END,
           parent_destination_id = COALESCE($8, parent_destination_id),
           days = COALESCE($9, days),
           accommodation_id = $14,
           accommodation = $15,
           activities = COALESCE($10, activities),
           transportation = COALESCE($11, transportation)
       WHERE id = $12
       RETURNING *`,
      [
        canonical?.area ?? null,
        canonical?.latitude ?? null,
        canonical?.longitude ?? null,
        order_sequence,
        canonical?.country ?? null,
        canonical?.country_code ?? null,
        canonical?.region ?? null,
        parent_destination_id,
        days,
        activities,
        transportation,
        id,
        canonical !== null,
        nextAccommodationId,
        nextAccommodationText,
      ]
    );

    await recordActivitySafely({
      req,
      action: 'UPDATE_DESTINATION',
      entityType: 'destination',
      entityId: destination.id,
      details: { tripId: destination.trip_id },
    });
    if (accommodationIdProvided && nextAccommodationId !== null) {
      await recordActivitySafely({
        req,
        action: 'SELECT_ACCOMMODATION',
        entityType: 'accommodation',
        entityId: nextAccommodationId,
        details: { destinationId: destination.id },
      });
    }

    return res.status(200).json({
      message: 'Destination updated.',
      destination: result.rows[0],
      ...(canonical ? { location: canonical } : {}),
      ...(canonical && (canonical.latitude === null || canonical.longitude === null) ? { warnings: ['OPEN LOCATION COORDINATES MISSING'] } : {}),
    });
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
  initDestinationsTable,
  getDestinations,
  getDestinationById,
  createDestination,
  updateDestination,
  deleteDestination,
};
