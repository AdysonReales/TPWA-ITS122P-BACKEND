const pool = require('../config/db');
const { getRequestContext } = require('../utils/requestContext');
const {
  validatePage,
  parsePositiveInteger,
  containsForbiddenBodyFields,
} = require('../utils/telemetryValidation');

async function startSession(req, res) {
  try {
    if (containsForbiddenBodyFields(req.body || {})) {
      return res.status(400).json({ message: 'User and request context fields are server-controlled.' });
    }
    const currentPage = validatePage(req.body?.current_page);
    const context = getRequestContext(req);
    const result = await pool.query(
      `INSERT INTO user_sessions (user_id, ip_address, user_agent, current_page)
       VALUES ($1, $2::inet, $3, $4)
       RETURNING id, user_id, current_page, started_at, last_seen_at, ended_at`,
      [req.user.id, context.ipAddress, context.userAgent, currentPage]
    );
    return res.status(201).json({ message: 'Session started.', session: result.rows[0] });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error('Start session error:', error);
    return res.status(500).json({ message: 'Unable to start session.' });
  }
}

async function heartbeatSession(req, res) {
  try {
    if (containsForbiddenBodyFields(req.body || {})) {
      return res.status(400).json({ message: 'User and request context fields are server-controlled.' });
    }
    const sessionId = parsePositiveInteger(req.body?.session_id);
    if (!sessionId) return res.status(400).json({ message: 'session_id must be a positive integer.' });
    const currentPage = validatePage(req.body?.current_page);

    const result = await pool.query(
      `UPDATE user_sessions
       SET last_seen_at = NOW(), current_page = COALESCE($1, current_page)
       WHERE id = $2 AND user_id = $3 AND ended_at IS NULL
       RETURNING id, user_id, current_page, started_at, last_seen_at, ended_at`,
      [currentPage, sessionId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Active session not found for the authenticated user.' });
    }
    return res.status(200).json({ message: 'Session heartbeat recorded.', session: result.rows[0] });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error('Session heartbeat error:', error);
    return res.status(500).json({ message: 'Unable to update session.' });
  }
}

async function endSession(req, res) {
  try {
    if (containsForbiddenBodyFields(req.body || {})) {
      return res.status(400).json({ message: 'User and request context fields are server-controlled.' });
    }
    const sessionId = parsePositiveInteger(req.body?.session_id);
    if (!sessionId) return res.status(400).json({ message: 'session_id must be a positive integer.' });
    const currentPage = validatePage(req.body?.current_page);

    const result = await pool.query(
      `UPDATE user_sessions
       SET last_seen_at = NOW(), ended_at = COALESCE(ended_at, NOW()),
           current_page = COALESCE($1, current_page)
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id, current_page, started_at, last_seen_at, ended_at`,
      [currentPage, sessionId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found for the authenticated user.' });
    }
    return res.status(200).json({ message: 'Session ended.', session: result.rows[0] });
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ message: error.message });
    console.error('End session error:', error);
    return res.status(500).json({ message: 'Unable to end session.' });
  }
}

async function getSessions(req, res) {
  try {
    const pageNumber = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = (pageNumber - 1) * limit;
    const status = req.query.status || 'all';
    if (!['all', 'active', 'previous'].includes(status)) {
      return res.status(400).json({ message: 'status must be all, active, or previous.' });
    }

    const activeExpression = `(s.ended_at IS NULL AND s.last_seen_at >= NOW() - INTERVAL '2 minutes')`;
    const conditions = [];
    const values = [];
    if (status === 'active') conditions.push(activeExpression);
    if (status === 'previous') conditions.push(`NOT ${activeExpression}`);
    if (req.query.user_id) {
      const userId = parsePositiveInteger(req.query.user_id);
      if (!userId) return res.status(400).json({ message: 'user_id must be a positive integer.' });
      values.push(userId);
      conditions.push(`s.user_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM user_sessions s ${where}`, values);
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT s.id, s.user_id, u.full_name, u.username, s.current_page,
              s.ip_address::text, s.user_agent, s.started_at, s.last_seen_at,
              s.ended_at, ${activeExpression} AS is_active
       FROM user_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       ${where}
       ORDER BY s.last_seen_at DESC, s.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    return res.status(200).json({
      sessions: result.rows,
      pagination: { page: pageNumber, limit, total: countResult.rows[0].total },
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    return res.status(500).json({ message: 'Unable to retrieve sessions.' });
  }
}

module.exports = { startSession, heartbeatSession, endSession, getSessions };
