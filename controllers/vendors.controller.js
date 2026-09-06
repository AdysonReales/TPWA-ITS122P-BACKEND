const pool = require('../config/db');

// GET /api/vendors  (admin/staff see all, vendor sees only their own)
async function getVendors(req, res) {
  try {
    const { id: userId, role } = req.user;

    const query =
      role === 'vendor'
        ? { text: 'SELECT * FROM vendor_profiles WHERE user_id = $1', values: [userId] }
        : { text: 'SELECT * FROM vendor_profiles ORDER BY business_name ASC', values: [] };

    const result = await pool.query(query.text, query.values);
    return res.status(200).json({ vendors: result.rows });
  } catch (err) {
    console.error('Get vendors error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// GET /api/vendors/:id
async function getVendorById(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    const result = await pool.query('SELECT * FROM vendor_profiles WHERE id = $1', [id]);
    const vendor = result.rows[0];
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    if (role === 'vendor' && vendor.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this vendor profile.' });
    }

    return res.status(200).json({ vendor });
  } catch (err) {
    console.error('Get vendor by id error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/vendors  (a vendor-role user creates their own business profile)
async function createVendor(req, res) {
  try {
    const { id: userId, role } = req.user;
    const { business_name, service_type } = req.body;

    if (!business_name || !service_type) {
      return res.status(400).json({ message: 'business_name and service_type are required.' });
    }

    // Only vendors create their own profile directly; admin/staff can also create one on a vendor's behalf via user_id in the body.
    const targetUserId = role === 'admin' || role === 'staff' ? req.body.user_id || userId : userId;

    const result = await pool.query(
      `INSERT INTO vendor_profiles (user_id, business_name, service_type)
       VALUES ($1, $2, $3) RETURNING *`,
      [targetUserId, business_name, service_type]
    );

    return res.status(201).json({ message: 'Vendor profile created.', vendor: result.rows[0] });
  } catch (err) {
    console.error('Create vendor error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/vendors/:id
async function updateVendor(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const { business_name, service_type } = req.body;

    const existing = await pool.query('SELECT * FROM vendor_profiles WHERE id = $1', [id]);
    const vendor = existing.rows[0];
    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found.' });

    if (role === 'vendor' && vendor.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this vendor profile.' });
    }

    const result = await pool.query(
      `UPDATE vendor_profiles
       SET business_name = COALESCE($1, business_name),
           service_type = COALESCE($2, service_type)
       WHERE id = $3 RETURNING *`,
      [business_name, service_type, id]
    );

    return res.status(200).json({ message: 'Vendor profile updated.', vendor: result.rows[0] });
  } catch (err) {
    console.error('Update vendor error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// DELETE /api/vendors/:id  (admin only, enforced at route level)
async function deleteVendor(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM vendor_profiles WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Vendor profile not found.' });
    }

    return res.status(200).json({ message: 'Vendor profile deleted.' });
  } catch (err) {
    console.error('Delete vendor error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getVendors, getVendorById, createVendor, updateVendor, deleteVendor };
