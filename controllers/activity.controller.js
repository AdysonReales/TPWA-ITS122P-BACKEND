const pool = require('../config/db');
const { parsePositiveInteger } = require('../utils/telemetryValidation');
const { ACTIVITY_ACTIONS } = require('../utils/activityEvents');

async function getActivity(req, res) {
  try {
    const pageNumber = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = (pageNumber - 1) * limit;
    const conditions = ['a.action = ANY($1::text[])'];
    const values = [ACTIVITY_ACTIONS];

    if (req.query.action || req.query.event_type) {
      const action = String(req.query.action || req.query.event_type).slice(0, 100);
      if (!ACTIVITY_ACTIONS.includes(action)) return res.status(400).json({ message: 'Unsupported activity action.' });
      values.push(action);
      conditions.push(`a.action = $${values.length}`);
    }
    if (req.query.session_id) {
      const sessionId = parsePositiveInteger(req.query.session_id);
      if (!sessionId) return res.status(400).json({ message: 'session_id must be a positive integer.' });
      values.push(sessionId);
      conditions.push(`a.session_id = $${values.length}`);
    }
    if (req.query.user_id) {
      const userId = parsePositiveInteger(req.query.user_id);
      if (!userId) return res.status(400).json({ message: 'user_id must be a positive integer.' });
      values.push(userId);
      conditions.push(`a.user_id = $${values.length}`);
    }
    if (req.query.user) {
      values.push(`%${String(req.query.user).slice(0, 100)}%`);
      conditions.push(`(u.full_name ILIKE $${values.length} OR u.username ILIKE $${values.length})`);
    }
    for (const [queryKey, operator] of [['from', '>='], ['to', '<=']]) {
      if (req.query[queryKey]) {
        const parsedDate = new Date(req.query[queryKey]);
        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({ message: `${queryKey} must be a valid date.` });
        }
        values.push(parsedDate.toISOString());
        conditions.push(`a.created_at ${operator} $${values.length}::timestamptz`);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${where}`,
      values
    );
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT a.id, a.user_id, a.session_id, u.full_name, u.username,
              a.action, a.entity_type, a.entity_id, a.details, a.created_at
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.status(200).json({
      activities: result.rows,
      pagination: { page: pageNumber, limit, total: countResult.rows[0].total },
    });
  } catch (error) {
    console.error('Get activity error:', error);
    return res.status(500).json({ message: 'Unable to retrieve activity.' });
  }
}

module.exports = { getActivity };
