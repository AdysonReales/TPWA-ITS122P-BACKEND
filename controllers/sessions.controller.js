const pool = require('../config/db');
const { parsePositiveInteger } = require('../utils/telemetryValidation');
const { ACTIVITY_ACTION_SQL } = require('../utils/activityEvents');
const { ACTIVE_TIMEOUT_SECONDS, normalizeVisitorId, startUserSession, closeStaleUserSessions } = require('../utils/userSessions');
const { serializeAdminSession } = require('../utils/maskIpAddress');

async function startVisit(req, res) {
  const visitorId = normalizeVisitorId(req.body?.visitor_id);
  if (!visitorId) return res.status(400).json({ message: 'A valid visitor_id is required.' });
  try {
    const session = await startUserSession(req, req.user?.id ?? null, visitorId, req.user?.session_id ?? null);
    return res.status(200).json({ session });
  } catch (error) {
    console.error('Start visit error:', error);
    return res.status(500).json({ message: 'Unable to start a visit session.' });
  }
}

async function heartbeatVisit(req, res) {
  const visitorId = normalizeVisitorId(req.body?.visitor_id);
  const sessionId = parsePositiveInteger(req.body?.session_id);
  if (!visitorId || !sessionId) {
    return res.status(400).json({ message: 'A valid visitor_id and session_id are required.' });
  }
  try {
    const session = await startUserSession(req, req.user?.id ?? null, visitorId, sessionId);
    return res.status(200).json({ session });
  } catch (error) {
    console.error('Visit heartbeat error:', error);
    return res.status(500).json({ message: 'Unable to update the visit session.' });
  }
}

async function getSessions(req, res) {
  try {
    await closeStaleUserSessions();
    const pageNumber = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = (pageNumber - 1) * limit;
    const conditions = [];
    const values = [];
    if (req.query.user_id) {
      const userId = parsePositiveInteger(req.query.user_id);
      if (!userId) return res.status(400).json({ message: 'user_id must be a positive integer.' });
      values.push(userId);
      conditions.push(`s.user_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM user_sessions s ${where}`, values);
    const activeTimeoutParameter = values.length + 1;
    const listValues = [...values, ACTIVE_TIMEOUT_SECONDS, limit, offset];
    const result = await pool.query(
      `SELECT s.id AS session_id, s.user_id, s.visitor_id, u.full_name, u.username, u.email, u.role,
              s.ip_address::text AS ip_address, s.user_agent,
              s.session_start, s.last_seen_at, s.session_end, s.duration_seconds,
              (s.session_end IS NULL) AS is_open,
              (s.session_end IS NULL AND s.last_seen_at >= NOW() - ($${activeTimeoutParameter}::INTEGER * INTERVAL '1 second')) AS is_active,
              (SELECT COUNT(*)::int FROM activity_logs a
               WHERE a.session_id = s.id AND a.action = ANY(${ACTIVITY_ACTION_SQL})) AS action_count
       FROM user_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       ${where}
       ORDER BY s.session_start DESC, s.id DESC
       LIMIT $${activeTimeoutParameter + 1} OFFSET $${activeTimeoutParameter + 2}`,
      listValues
    );
    const sessions = result.rows.map(serializeAdminSession);
    return res.status(200).json({
      sessions,
      pagination: { page: pageNumber, limit, total: countResult.rows[0].total },
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    return res.status(500).json({ message: 'Unable to retrieve sessions.' });
  }
}

async function getSessionMetrics(req, res) {
  try {
    await closeStaleUserSessions();
    const periods = { '30d': 30, '90d': 90, '1y': 365 };
    const period = req.query.period || '30d';
    const intervalDays = periods[period];
    if (!intervalDays) return res.status(400).json({ message: 'period must be 30d, 90d, or 1y.' });

    const result = await pool.query(
      `WITH windows AS (
         SELECT NOW() - ($1::int * INTERVAL '1 day') AS current_start,
                NOW() - ($1::int * 2 * INTERVAL '1 day') AS previous_start
       )
       SELECT
         COUNT(s.id) FILTER (WHERE s.session_end IS NULL AND s.last_seen_at >= NOW() - INTERVAL '5 minutes')::int AS active_visitors,
         COUNT(s.id) FILTER (WHERE s.session_end IS NULL AND s.last_seen_at >= NOW() - INTERVAL '5 minutes' AND s.user_id IS NOT NULL)::int AS logged_in_visitors,
         COUNT(s.id) FILTER (WHERE s.session_end IS NULL AND s.last_seen_at >= NOW() - INTERVAL '5 minutes' AND s.user_id IS NULL)::int AS guest_visitors,
         COUNT(s.id)::int AS total_sessions,
         COUNT(s.id) FILTER (WHERE s.session_end IS NOT NULL AND s.session_start >= w.current_start)::int AS completed_sessions,
         ROUND(AVG(s.duration_seconds) FILTER (WHERE s.session_end IS NOT NULL AND s.session_start >= w.current_start))::int AS average_duration_seconds,
         COUNT(s.id) FILTER (WHERE s.session_end IS NOT NULL AND s.session_start >= w.previous_start AND s.session_start < w.current_start)::int AS previous_completed_sessions,
         ROUND(AVG(s.duration_seconds) FILTER (WHERE s.session_end IS NOT NULL AND s.session_start >= w.previous_start AND s.session_start < w.current_start))::int AS previous_average_duration_seconds
       FROM windows w
       LEFT JOIN user_sessions s ON TRUE`,
      [intervalDays]
    );
    return res.status(200).json({ period, ...result.rows[0] });
  } catch (error) {
    console.error('Get session metrics error:', error);
    return res.status(500).json({ message: 'Unable to retrieve session metrics.' });
  }
}

async function getSessionActions(req, res) {
  try {
    const sessionId = parsePositiveInteger(req.params.id);
    if (!sessionId) return res.status(400).json({ message: 'Session ID must be a positive integer.' });
    const session = await pool.query(
      'SELECT id AS session_id, ip_address::text AS ip_address FROM user_sessions WHERE id = $1',
      [sessionId]
    );
    if (!session.rows[0]) return res.status(404).json({ message: 'Session not found.' });

    const pageNumber = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = (pageNumber - 1) * limit;
    const [countResult, result] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM activity_logs WHERE session_id = $1 AND action = ANY(${ACTIVITY_ACTION_SQL})`, [sessionId]),
      pool.query(
        `SELECT id, user_id, session_id, action, entity_type, entity_id, details, created_at
         FROM activity_logs
         WHERE session_id = $1 AND action = ANY(${ACTIVITY_ACTION_SQL})
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [sessionId, limit, offset]
      ),
    ]);
    return res.status(200).json({
      session: serializeAdminSession(session.rows[0]),
      actions: result.rows,
      pagination: { page: pageNumber, limit, total: countResult.rows[0].total },
    });
  } catch (error) {
    console.error('Get session actions error:', error);
    return res.status(500).json({ message: 'Unable to retrieve session actions.' });
  }
}

module.exports = { startVisit, heartbeatVisit, getSessions, getSessionActions, getSessionMetrics };
