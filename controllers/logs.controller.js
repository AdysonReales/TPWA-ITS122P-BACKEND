const pool = require('../config/db');

// GET /api/logs  (admin only, optional ?user_id= filter)
async function getLogs(req, res) {
  try {
    const { user_id } = req.query;

    const result = user_id
      ? await pool.query('SELECT * FROM system_logs WHERE user_id = $1 ORDER BY created_at DESC', [user_id])
      : await pool.query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 200');

    return res.status(200).json({ logs: result.rows });
  } catch (err) {
    console.error('Get logs error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getLogs };
