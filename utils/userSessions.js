const pool = require('../config/db');
const { getRequestContext } = require('./requestContext');

async function startUserSession(req, userId) {
  const context = getRequestContext(req);
  const result = await pool.query(
    `INSERT INTO user_sessions (
       user_id, ip_address, user_agent, started_at, last_seen_at, session_start
     ) VALUES ($1, $2::inet, $3, NOW(), NOW(), NOW())
     RETURNING id, user_id, ip_address::text, user_agent, session_start, session_end, duration_seconds`,
    [userId, context.ipAddress, context.userAgent]
  );
  return result.rows[0];
}

async function endUserSession(sessionId, userId) {
  const parsedSessionId = Number(sessionId);
  const parsedUserId = Number(userId);
  if (!Number.isSafeInteger(parsedSessionId) || parsedSessionId <= 0
    || !Number.isSafeInteger(parsedUserId) || parsedUserId <= 0) return null;

  const result = await pool.query(
    `UPDATE user_sessions
     SET session_end = COALESCE(session_end, NOW()),
         ended_at = COALESCE(ended_at, NOW()),
         last_seen_at = NOW(),
         duration_seconds = COALESCE(
           duration_seconds,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(session_end, NOW()) - session_start)))::INTEGER)
         )
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, session_start, session_end, duration_seconds`,
    [parsedSessionId, parsedUserId]
  );
  return result.rows[0] || null;
}

module.exports = { startUserSession, endUserSession };
