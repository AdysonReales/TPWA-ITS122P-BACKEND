const pool = require('../config/db');

// GET /api/notifications  (only the logged-in user's own notifications)
async function getNotifications(req, res) {
  try {
    const { id: userId } = req.user;
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return res.status(200).json({ notifications: result.rows });
  } catch (err) {
    console.error('Get notifications error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/notifications/:id/read  (mark a single notification as read)
async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const result = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    return res.status(200).json({ message: 'Notification marked as read.', notification: result.rows[0] });
  } catch (err) {
    console.error('Mark notification read error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/notifications/read-all  (mark all of the user's notifications as read)
async function markAllAsRead(req, res) {
  try {
    const { id: userId } = req.user;
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
    return res.status(200).json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getNotifications, markAsRead, markAllAsRead };
