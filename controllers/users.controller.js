const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { logAction } = require('../utils/logger');

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
    const isAdmin = req.user?.role === 'admin';
    if (!req.user || (String(req.user.id) !== String(id) && !isAdmin)) {
      return res.status(403).json({ message: 'You do not have access to update this account.' });
    }
    if (!isAdmin && (role !== undefined || is_active !== undefined)) {
      return res.status(403).json({ message: 'Only administrators can change account role or activation state.' });
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    if (is_active !== undefined && typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be a boolean.' });
    }

    let passwordHash = null;
    let updatedPastPasswords = null;

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
      }

      // Check user exists and inspect current / past passwords
      const existingRes = await pool.query(
        'SELECT password_hash, past_passwords FROM users WHERE id = $1',
        [id]
      );
      if (existingRes.rows.length === 0) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const existingUser = existingRes.rows[0];

      // 1. Prevent reusing current password
      if (existingUser.password_hash) {
        const isCurrent = await bcrypt.compare(password, existingUser.password_hash);
        if (isCurrent) {
          return res.status(400).json({
            message: 'New password cannot be the same as your current password.',
          });
        }
      }

      // 2. Prevent reusing past passwords
      const pastPasswords = Array.isArray(existingUser.past_passwords) ? existingUser.past_passwords : [];
      for (const pastHash of pastPasswords) {
        if (pastHash) {
          const isPast = await bcrypt.compare(password, pastHash);
          if (isPast) {
            return res.status(400).json({
              message: 'New password cannot be the same as any of your previous passwords.',
            });
          }
        }
      }

      passwordHash = await bcrypt.hash(password, 10);
      updatedPastPasswords = existingUser.password_hash
        ? [...pastPasswords, existingUser.password_hash].slice(-5)
        : pastPasswords;
    }

    // Update user in PostgreSQL database including username, bio, avatar_url, and password_hash
    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           username = COALESCE($2, username),
           bio = COALESCE($3, bio),
           avatar_url = COALESCE($4, avatar_url),
           role = COALESCE($5, role),
           is_active = COALESCE($6, is_active),
           password_hash = COALESCE($7, password_hash),
           past_passwords = COALESCE($8, past_passwords)
       WHERE id = $9
       RETURNING id, full_name, username, email, role, bio, avatar_url, is_active`,
      [
        full_name || name,
        username,
        bio,
        avatar_url,
        role,
        is_active,
        passwordHash,
        updatedPastPasswords,
        id,
      ]
    );

    const updatedUser = result.rows[0];
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (req.user) {
      const actionType =
        is_active !== undefined
          ? is_active
            ? 'ACTIVATE_USER'
            : 'DEACTIVATE_USER'
          : 'UPDATE_USER';
      logAction({
        userId: req.user.id,
        actionType,
        tableAffected: 'users',
        recordId: id,
        description:
          is_active !== undefined
            ? `${is_active ? 'Activated' : 'Deactivated'} account for ${updatedUser.full_name || updatedUser.email}`
            : `Updated account for ${updatedUser.full_name || updatedUser.email}`,
      });
    }

    return res.status(200).json({ message: 'User updated successfully.', user: updatedUser });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// DELETE /api/users/:id  (admin only)
async function deleteUser(req, res) {
  if (!req.user?.id) {
    return res.status(403).json({ message: 'Administrator identity is required.' });
  }

  const requestedUserId = Number(req.params.id);
  if (!Number.isSafeInteger(requestedUserId) || requestedUserId <= 0) {
    return res.status(400).json({ message: 'A valid user ID is required.' });
  }
  if (requestedUserId === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot force-delete the administrator account performing this action.' });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const existingResult = await client.query(
      'SELECT id, full_name, email FROM users WHERE id = $1 FOR UPDATE',
      [requestedUserId]
    );
    const targetUser = existingResult.rows[0];
    if (!targetUser) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'User not found.' });
    }

    const columnsResult = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'system_logs'`
    );
    const logColumns = new Set(columnsResult.rows.map((row) => row.column_name));
    const column = (...candidates) => candidates.find((candidate) => logColumns.has(candidate));
    const actorColumn = column('user_id', 'userid');
    const actionColumn = column('action_type', 'actiontype');
    const tableColumn = column('table_affected', 'tableaffected');
    const recordColumn = column('record_id', 'recordid');
    const descriptionColumn = column('description');
    if (!actorColumn || !actionColumn || !tableColumn || !recordColumn || !descriptionColumn) {
      throw new Error('System audit log is missing required columns.');
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 100) : '';
    const targetSnapshot = [targetUser.full_name, targetUser.email]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 110);
    const description = `Force deleted user #${targetUser.id}${targetSnapshot ? ` (${targetSnapshot})` : ''}${reason ? `. Reason: ${reason}` : ''}`
      .slice(0, 255);

    const quoted = (name) => `"${name}"`;
    await client.query(
      `INSERT INTO system_logs (${[actorColumn, actionColumn, tableColumn, recordColumn, descriptionColumn].map(quoted).join(', ')})
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'FORCE_DELETE_USER', 'users', targetUser.id, description]
    );

    // Keep prior audit records while removing the target user's FK reference.
    await client.query(
      `UPDATE system_logs SET ${quoted(actorColumn)} = NULL WHERE ${quoted(actorColumn)} = $1`,
      [targetUser.id]
    );

    // Remove non-cascading dependents and trip-owned records before deleting the user.
    await client.query('DELETE FROM activity_logs WHERE user_id = $1', [targetUser.id]);
    await client.query('DELETE FROM user_sessions WHERE user_id = $1', [targetUser.id]);
    await client.query(
      `DELETE FROM bookings
       WHERE user_id = $1
          OR trip_id IN (SELECT id FROM trips WHERE user_id = $1)
          OR destination_id IN (
            SELECT d.id FROM destinations d
            JOIN trips t ON t.id = d.trip_id
            WHERE t.user_id = $1
          )`,
      [targetUser.id]
    );
    await client.query(
      `DELETE FROM expenses
       WHERE trip_id IN (SELECT id FROM trips WHERE user_id = $1)
          OR destination_id IN (
            SELECT d.id FROM destinations d
            JOIN trips t ON t.id = d.trip_id
            WHERE t.user_id = $1
          )`,
      [targetUser.id]
    );
    await client.query('DELETE FROM destinations WHERE trip_id IN (SELECT id FROM trips WHERE user_id = $1)', [targetUser.id]);
    await client.query('DELETE FROM trips WHERE user_id = $1', [targetUser.id]);
    await client.query('DELETE FROM feedback WHERE user_id = $1', [targetUser.id]);
    await client.query('DELETE FROM notifications WHERE user_id = $1', [targetUser.id]);
    await client.query('DELETE FROM vendor_profiles WHERE user_id = $1', [targetUser.id]);

    const deletedResult = await client.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [targetUser.id]
    );
    if (!deletedResult.rows[0]) {
      throw new Error('Target user disappeared during force deletion.');
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return res.status(200).json({ message: 'User deleted.' });
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Force delete rollback error:', rollbackError);
      }
    }
    console.error('Delete user error:', err);
    const message = err?.code === '23503'
      ? `Deletion is blocked by related records${err.constraint ? ` (${err.constraint})` : ''}.`
      : (err?.message || 'Unable to delete user and record the audit event.');
    return res.status(500).json({ message });
  } finally {
    client?.release();
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
