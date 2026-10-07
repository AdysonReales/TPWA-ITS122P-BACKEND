const pool = require('../config/db');
const { getRequestContext } = require('./requestContext');

const ACTIVE_TIMEOUT_SECONDS = 5 * 60;
const MAX_HEARTBEAT_CREDIT_SECONDS = 90;
const VISITOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeVisitorId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return VISITOR_ID_PATTERN.test(normalized) ? normalized : null;
}

function isRecentlyActive(lastSeenAt) {
  const lastSeen = new Date(lastSeenAt).getTime();
  return Number.isFinite(lastSeen) && Date.now() - lastSeen <= ACTIVE_TIMEOUT_SECONDS * 1000;
}

async function closeVisit(client, sessionId) {
  await client.query(
    `UPDATE user_sessions
     SET session_end = COALESCE(session_end, last_seen_at),
         ended_at = COALESCE(ended_at, last_seen_at),
         duration_seconds = COALESCE(
           duration_seconds,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (last_seen_at - session_start)))::INTEGER)
         )
     WHERE id = $1 AND session_end IS NULL`,
    [sessionId]
  );
}

async function updateActiveVisit(client, session, req, userId, visitorId) {
  const context = getRequestContext(req);
  const result = await client.query(
    `UPDATE user_sessions
     SET user_id = $2::INTEGER,
         visitor_id = COALESCE($3::UUID, visitor_id),
         ip_address = COALESCE($4::INET, ip_address),
         user_agent = COALESCE($5, user_agent),
         duration_seconds = COALESCE(duration_seconds, 0) +
           LEAST($6, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - last_seen_at)))::INTEGER)),
         last_seen_at = NOW()
     WHERE id = $1 AND session_end IS NULL
     RETURNING id, user_id, visitor_id, session_start, last_seen_at, session_end, duration_seconds`,
    [session.id, userId, visitorId, context.ipAddress, context.userAgent, MAX_HEARTBEAT_CREDIT_SECONDS]
  );
  return result.rows[0];
}

async function insertVisit(client, req, userId, visitorId) {
  const context = getRequestContext(req);
  const result = await client.query(
    `INSERT INTO user_sessions (
       user_id, visitor_id, ip_address, user_agent, started_at, last_seen_at,
       session_start, duration_seconds
     ) VALUES ($1, $2, $3::INET, $4, NOW(), NOW(), NOW(), 0)
     RETURNING id, user_id, visitor_id, session_start, last_seen_at, session_end, duration_seconds`,
    [userId, visitorId, context.ipAddress, context.userAgent]
  );
  return result.rows[0];
}

async function startUserSession(req, userId, rawVisitorId = null, existingSessionId = null) {
  const visitorId = normalizeVisitorId(rawVisitorId);
  const normalizedUserId = Number.isSafeInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null;
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    let visitorVisits = [];
    if (visitorId) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [visitorId]);
      const result = await client.query(
        `SELECT id, user_id, visitor_id, last_seen_at
         FROM user_sessions
         WHERE visitor_id = $1 AND session_end IS NULL
         ORDER BY session_start DESC, id DESC
         FOR UPDATE`,
        [visitorId]
      );
      visitorVisits = result.rows;
    }

    let existingVisit = visitorVisits.find((visit) => isRecentlyActive(visit.last_seen_at)) || null;
    if (!existingVisit && normalizedUserId && Number.isSafeInteger(Number(existingSessionId))) {
      const result = await client.query(
        `SELECT id, user_id, visitor_id, last_seen_at
         FROM user_sessions
         WHERE id = $1 AND user_id = $2 AND session_end IS NULL
         FOR UPDATE`,
        [Number(existingSessionId), normalizedUserId]
      );
      const tokenVisit = result.rows[0];
      if (tokenVisit && isRecentlyActive(tokenVisit.last_seen_at)
        && (!tokenVisit.visitor_id || tokenVisit.visitor_id === visitorId)) {
        existingVisit = tokenVisit;
      } else if (tokenVisit) {
        await closeVisit(client, tokenVisit.id);
      }
    }

    if (existingVisit) {
      for (const visit of visitorVisits) {
        if (visit.id !== existingVisit.id) await closeVisit(client, visit.id);
      }
      const updated = await updateActiveVisit(client, existingVisit, req, normalizedUserId, visitorId);
      await client.query('COMMIT');
      transactionStarted = false;
      return updated;
    }

    for (const visit of visitorVisits) await closeVisit(client, visit.id);
    const created = await insertVisit(client, req, normalizedUserId, visitorId);
    await client.query('COMMIT');
    transactionStarted = false;
    return created;
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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
         duration_seconds = COALESCE(duration_seconds, 0) +
           LEAST($3, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - last_seen_at)))::INTEGER)),
         last_seen_at = NOW()
     WHERE id = $1 AND user_id = $2 AND session_end IS NULL
     RETURNING id, user_id, visitor_id, session_start, session_end, duration_seconds`,
    [parsedSessionId, parsedUserId, MAX_HEARTBEAT_CREDIT_SECONDS]
  );
  return result.rows[0] || null;
}

async function closeStaleUserSessions() {
  const result = await pool.query(
    `UPDATE user_sessions
     SET session_end = last_seen_at,
         ended_at = COALESCE(ended_at, last_seen_at),
         duration_seconds = COALESCE(
           duration_seconds,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (last_seen_at - session_start)))::INTEGER)
         )
     WHERE session_end IS NULL
       AND last_seen_at < NOW() - ($1::INTEGER * INTERVAL '1 second')
     RETURNING id`,
    [ACTIVE_TIMEOUT_SECONDS]
  );
  return result.rows.length;
}

module.exports = {
  ACTIVE_TIMEOUT_SECONDS,
  MAX_HEARTBEAT_CREDIT_SECONDS,
  normalizeVisitorId,
  startUserSession,
  endUserSession,
  closeStaleUserSessions,
};
