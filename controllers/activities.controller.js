const pool = require('../config/db');
const {
  normalizeCountry,
  normalizeLookup,
  countryQueryVariants,
  getDestinationLocation,
} = require('../utils/accommodationLocation');

function matchesRecommendationDestination(recommendation, requestedArea) {
  const requested = normalizeLookup(requestedArea);
  if (!requested) return false;
  return [recommendation.destination_name, ...(recommendation.destination_aliases || [])]
    .some((candidate) => normalizeLookup(candidate) === requested);
}

async function getVendorProfileIdForUser(userId) {
  const result = await pool.query('SELECT id FROM vendor_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

// GET /api/activities  (optional filters: ?destination_id=, ?category_id=, ?vendor_id=)
async function getActivities(req, res) {
  try {
    const { destination_id, category_id, vendor_id } = req.query;
    const destination = typeof req.query.destination === 'string' ? req.query.destination.trim() : '';
    const country = typeof req.query.country === 'string' ? req.query.country.trim() : '';

    if (req.query.destination !== undefined && (!destination || destination.length > 150)) {
      return res.status(400).json({ message: 'destination must be a non-empty area name of at most 150 characters.' });
    }
    if (req.query.country !== undefined && (!country || country.length > 150)) {
      return res.status(400).json({ message: 'country must be a non-empty country name of at most 150 characters.' });
    }
    const conditions = [];
    const values = [];

    if (destination_id) {
      values.push(destination_id);
      conditions.push(`destination_id = $${values.length}`);
    }
    if (category_id) {
      values.push(category_id);
      conditions.push(`category_id = $${values.length}`);
    }
    if (vendor_id) {
      values.push(vendor_id);
      conditions.push(`vendor_id = $${values.length}`);
    }
    if (destination) {
      values.push(destination);
      const areaParameter = `$${values.length}`;
      conditions.push(`(
        LOWER(d.location_name) = LOWER(${areaParameter})
        OR LOWER(d.location_name) LIKE LOWER(${areaParameter} || ',%')
        OR LOWER(${areaParameter}) LIKE LOWER(d.location_name || ',%')
      )`);
    }
    if (country) {
      values.push(country);
      // Legacy/demo destinations may predate the country column. When country
      // is missing, the strict area condition above still scopes the matches.
      conditions.push(`(d.country IS NULL OR LOWER(d.country) = LOWER($${values.length}))`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT a.*, d.location_name as destination, d.country as destination_country,
              c.name as category, c.type as category_type
       FROM activities a
       LEFT JOIN destinations d ON a.destination_id = d.id
       LEFT JOIN categories c ON a.category_id = c.categoryid
       ${where} ORDER BY a.start_time ASC`,
      values
    );

    let activities = result.rows;
    if (destination && country) {
      const { area: requestedArea } = getDestinationLocation({ location_name: destination, country });
      const recommendations = await pool.query(
        `SELECT -id AS id, title, destination_name AS destination,
                country AS destination_country, destination_name, destination_aliases,
                category, category_type,
                NULL::integer AS destination_id, 0::numeric AS cost
         FROM activity_recommendations
         WHERE LOWER(country) = ANY($1::text[])
         ORDER BY title ASC`,
        [countryQueryVariants(country)]
      );
      const canonicalCountry = normalizeCountry(country);
      const seenTitles = new Set(activities.map((activity) => activity.title.trim().toLocaleLowerCase()));
      activities = [
        ...activities,
        ...recommendations.rows
          .filter((activity) => normalizeCountry(activity.destination_country) === canonicalCountry)
          .filter((activity) => matchesRecommendationDestination(activity, requestedArea))
          .filter((activity) => {
          const key = activity.title.trim().toLocaleLowerCase();
          if (seenTitles.has(key)) return false;
          seenTitles.add(key);
          return true;
          })
          .map(({ destination_name, destination_aliases, ...activity }) => activity),
      ];
    }

    return res.status(200).json({ activities });
  } catch (err) {
    console.error('Get activities error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// GET /api/activities/:id
async function getActivityById(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT a.*, d.location_name as destination, d.country as destination_country,
              c.name as category, c.type as category_type
       FROM activities a
       LEFT JOIN destinations d ON a.destination_id = d.id
       LEFT JOIN categories c ON a.category_id = c.categoryid
       WHERE a.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Activity not found.' });
    return res.status(200).json({ activity: result.rows[0] });
  } catch (err) {
    console.error('Get activity by id error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/activities  (vendor creates for their own profile; staff/admin can specify vendor_id)
async function createActivity(req, res) {
  try {
    const { id: userId, role } = req.user;
    let { destination_id, title, start_time, end_time, cost } = req.body;
    const category_id = req.body.category_id ?? req.body.categoryid;
    let { vendor_id } = req.body;

    if (!title || !category_id) {
      return res.status(400).json({
        message: 'Title and category_id are required.',
      });
    }

    if (role === 'vendor') {
      vendor_id = await getVendorProfileIdForUser(userId);
      if (!vendor_id) {
        return res.status(400).json({ message: 'You need a vendor profile before creating activities.' });
      }
    } else if (!vendor_id) {
      const vpRes = await pool.query('SELECT id FROM vendor_profiles LIMIT 1');
      if (vpRes.rows.length > 0) {
        vendor_id = vpRes.rows[0].id;
      }
    }

    // Resolve catalog destinations by integer ID or by the frontend's name field.
    if (destination_id && !/^\d+$/.test(String(destination_id).trim())) {
      destination_id = null;
    }
    if (!destination_id && req.body.destination) {
      const destMatch = await pool.query(
        'SELECT id FROM destinations WHERE location_name ILIKE $1 LIMIT 1',
        [`%${req.body.destination.trim()}%`]
      );
      if (destMatch.rows.length > 0) {
        destination_id = destMatch.rows[0].id;
      }
    }

    if (!destination_id && !req.body.destination) {
      const anyDest = await pool.query('SELECT id FROM destinations LIMIT 1');
      if (anyDest.rows.length > 0) {
        destination_id = anyDest.rows[0].id;
      }
    }
    if (!destination_id) {
      return res.status(400).json({ message: 'A valid destination_id or matching destination name is required.' });
    }

    const resolvedStartTime = start_time || new Date().toISOString();
    const resolvedEndTime = end_time || new Date(Date.now() + 2 * 3600000).toISOString();

    const result = await pool.query(
      `INSERT INTO activities (destination_id, category_id, vendor_id, title, start_time, end_time, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [destination_id, category_id, vendor_id, title.trim(), resolvedStartTime, resolvedEndTime, cost || 0]
    );

    return res.status(201).json({ message: 'Activity created.', activity: result.rows[0] });
  } catch (err) {
    console.error('Create activity error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/activities/:id
async function updateActivity(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const { title, start_time, end_time, cost } = req.body;
    const category_id = req.body.category_id ?? req.body.categoryid;

    const existing = await pool.query('SELECT * FROM activities WHERE id = $1', [id]);
    const activity = existing.rows[0];
    if (!activity) return res.status(404).json({ message: 'Activity not found.' });

    if (role === 'vendor') {
      const vendorId = await getVendorProfileIdForUser(userId);
      if (activity.vendor_id !== vendorId) {
        return res.status(403).json({ message: 'You do not have access to this activity.' });
      }
    }

    const result = await pool.query(
      `UPDATE activities
       SET title = COALESCE($1, title),
           start_time = COALESCE($2, start_time),
           end_time = COALESCE($3, end_time),
           cost = COALESCE($4, cost),
           category_id = COALESCE($5, category_id)
       WHERE id = $6 RETURNING *`,
      [title, start_time, end_time, cost, category_id, id]
    );

    return res.status(200).json({ message: 'Activity updated.', activity: result.rows[0] });
  } catch (err) {
    console.error('Update activity error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// DELETE /api/activities/:id
async function deleteActivity(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    const existing = await pool.query('SELECT * FROM activities WHERE id = $1', [id]);
    const activity = existing.rows[0];
    if (!activity) return res.status(404).json({ message: 'Activity not found.' });

    if (role === 'vendor') {
      const vendorId = await getVendorProfileIdForUser(userId);
      if (activity.vendor_id !== vendorId) {
        return res.status(403).json({ message: 'You do not have access to this activity.' });
      }
    }

    await pool.query('DELETE FROM activities WHERE id = $1', [id]);
    return res.status(200).json({ message: 'Activity deleted.' });
  } catch (err) {
    console.error('Delete activity error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getActivities, getActivityById, createActivity, updateActivity, deleteActivity, matchesRecommendationDestination };
