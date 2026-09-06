const bcrypt = require('bcrypt');
const pool = require('../config/db');

const VALID_ROLES = ['admin', 'staff', 'customer', 'vendor'];

// GET /api/users  (admin only)
async function getAllUsers(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users ORDER BY id ASC'
    );
    return res.status(200).json({ users: result.rows });
  } catch (err) {
    console.error('Get all users error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// GET /api/users/:id  (admin only)
async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user by id error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/users  (admin only — for creating Staff/Admin accounts directly)
async function createUser(req, res) {
  try {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ message: 'full_name, email, password, and role are required.' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Email is already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, created_at`,
      [full_name, email, password_hash, role]
    );

    return res.status(201).json({ message: 'User created.', user: result.rows[0] });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/users/:id  (admin only)
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { full_name, role, is_active } = req.body;

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           role = COALESCE($2, role),
           is_active = COALESCE($3, is_active)
       WHERE id = $4
       RETURNING id, full_name, email, role, is_active, created_at`,
      [full_name, role, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ message: 'User updated.', user: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// DELETE /api/users/:id  (admin only)
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ message: 'User deleted.' });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser };
