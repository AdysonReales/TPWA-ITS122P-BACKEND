const pool = require('../config/db');

async function getVendorProfileIdForUser(userId) {
  const result = await pool.query('SELECT id FROM vendor_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

// GET /api/activities  (optional filters: ?destination_id=, ?category_id=, ?vendor_id=)
async function getActivities(req, res) {
  try {
    const { destination_id, category_id, vendor_id } = req.query;
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

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(`SELECT * FROM activities ${where} ORDER BY start_time ASC`, values);

    return res.status(200).json({ activities: result.rows });
  } catch (err) {
    console.error('Get activities error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// GET /api/activities/:id
async function getActivityById(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM activities WHERE id = $1', [id]);
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
    const { destination_id, category_id, title, start_time, end_time, cost } = req.body;
    let { vendor_id } = req.body;

    if (!destination_id || !category_id || !title || !start_time || !end_time) {
      return res.status(400).json({
        message: 'destination_id, category_id, title, start_time, and end_time are required.',
      });
    }

    if (role === 'vendor') {
      vendor_id = await getVendorProfileIdForUser(userId);
      if (!vendor_id) {
        return res.status(400).json({ message: 'You need a vendor profile before creating activities.' });
      }
    } else if (!vendor_id) {
      return res.status(400).json({ message: 'vendor_id is required for staff/admin-created activities.' });
    }

    const result = await pool.query(
      `INSERT INTO activities (destination_id, category_id, vendor_id, title, start_time, end_time, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [destination_id, category_id, vendor_id, title, start_time, end_time, cost || 0]
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
    const { title, start_time, end_time, cost, category_id } = req.body;

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

module.exports = { getActivities, getActivityById, createActivity, updateActivity, deleteActivity };
