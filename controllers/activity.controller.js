const pool = require('../config/db');
const { insertActivity, validateAndSanitizeMetadata } = require('../utils/activityLogger');
const {
  validatePage,
  parsePositiveInteger,
  containsForbiddenBodyFields,
} = require('../utils/telemetryValidation');

const MAX_EVENT_TYPE_LENGTH = 100;

async function createActivity(req, res) {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ message: 'A JSON object is required.' });
    }
    if (containsForbiddenBodyFields(req.body)) {
      return res.status(400).json({ message: 'The request contains a server-controlled or sensitive field.' });
    }

    const { event_type, page, session_id, metadata } = req.body;
    if (typeof event_type !== 'string' || !event_type.trim() || event_type.length > MAX_EVENT_TYPE_LENGTH) {
      return res.status(400).json({
        message: `event_type is required and must not exceed ${MAX_EVENT_TYPE_LENGTH} characters.`,
      });
    }

    const safePage = validatePage(page);
    const safeMetadata = validateAndSanitizeMetadata(metadata);
    const sessionId = parsePositiveInteger(session_id);
    if (session_id !== undefined && sessionId === null) {
      return res.status(400).json({ message: 'session_id must be a positive integer.' });
    }

    if (sessionId !== null) {
      const ownedSession = await pool.query(
        'SELECT id FROM user_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, req.user.id]
      );
      if (ownedSession.rows.length === 0) {
        return res.status(403).json({ message: 'The session does not belong to the authenticated user.' });
      }
    }

    const activity = await insertActivity({
      req,
      userId: req.user.id,
      sessionId,
      eventType: event_type.trim(),
      page: safePage,
      metadata: safeMetadata,
    });

    return res.status(201).json({
      message: 'Activity recorded.',
      activity: {
        id: activity.id,
        user_id: activity.user_id,
        session_id: activity.session_id,
        event_type: activity.event_type,
        page: activity.page,
        created_at: activity.created_at,
      },
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Create activity error:', error);
    return res.status(500).json({ message: 'Unable to record activity.' });
  }
}

async function getActivity(req, res) {
  try {
    const pageNumber = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = (pageNumber - 1) * limit;
    const conditions = [];
    const values = [];

    if (req.query.event_type) {
      values.push(String(req.query.event_type).slice(0, MAX_EVENT_TYPE_LENGTH));
      conditions.push(`a.event_type = $${values.length}`);
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

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${where}`,
      values
    );
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT a.id, a.user_id, a.session_id, u.full_name, u.username,
              a.event_type, a.page, a.ip_address::text, a.user_agent,
              a.metadata, a.created_at
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

module.exports = { createActivity, getActivity };
