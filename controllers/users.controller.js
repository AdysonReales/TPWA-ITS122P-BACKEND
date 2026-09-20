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
// PUT /api/users/:id  (update profile including username, bio, and avatar)
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, full_name, username, bio, avatar_url, password, role, is_active } = req.body;

    // Update user in PostgreSQL database including username, bio, and avatar_url
    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           username = COALESCE($2, username),
           bio = COALESCE($3, bio),
           avatar_url = COALESCE($4, avatar_url),
           role = COALESCE($5, role),
           is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING id, full_name, username, email, role, bio, avatar_url, is_active`,
      [
        full_name || name,
        username,
        bio,
        avatar_url,
        role,
        is_active,
        id,
      ]
    );

    const updatedUser = result.rows[0];
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ message: 'User updated successfully.', user: updatedUser });
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
// GET /api/users/search?q=... (Search users by name or username)
async function searchUsers(req, res) {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(200).json({ users: [] });
    }

    const searchTerm = `%${q.trim().toLowerCase()}%`;
    const result = await pool.query(
      `SELECT id, full_name, username, avatar_url 
       FROM users 
       WHERE LOWER(full_name) LIKE $1 OR LOWER(username) LIKE $1 
       LIMIT 10`,
      [searchTerm]
    );

    return res.status(200).json({ users: result.rows });
  } catch (err) {
    console.error('Search users error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// GET /api/users/profile/:username (Get public profile and trips by username)
async function getUserByUsername(req, res) {
  try {
    const { username } = req.params;
    const cleanUsername = username.replace(/^@+/, '');

    // 1. Fetch user by username
    const userResult = await pool.query(
      'SELECT id, full_name, username, bio, avatar_url FROM users WHERE username = $1',
      [cleanUsername]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // 2. Fetch public trips belonging to this user
    const tripsResult = await pool.query(
      "SELECT * FROM trips WHERE user_id = $1 AND visibility = 'public' ORDER BY start_date ASC",
      [user.id]
    );

    // Map trips to match frontend camelCase expectations if needed
    const trips = tripsResult.rows.map(t => ({
      id: t.id,
      name: t.title,
      startDate: t.start_date,
      endDate: t.end_date,
      totalBudget: t.total_budget,
      status: t.status,
      cover_photo: t.cover_photo,
      visibility: t.visibility,
    }));

    return res.status(200).json({
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatar_url,
      trips,
    });
  } catch (err) {
    console.error('Get user by username error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, searchUsers, getUserByUsername };
