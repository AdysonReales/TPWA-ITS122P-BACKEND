const pool = require('../config/db');

/**
 * Writes an entry to system_logs for auditing.
 * Fire-and-forget: never throws, never blocks the calling request.
 * userId may be null (e.g. for system-triggered events).
 */
async function logAction({ userId = null, actionType, tableAffected = null, recordId = null, description = null }) {
  try {
    await pool.query(
      `INSERT INTO system_logs (user_id, action_type, table_affected, record_id, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, actionType, tableAffected, recordId, description]
    );
  } catch (err) {
    // Logging must never break the actual request — just report it.
    console.error('Failed to write system log:', err.message);
  }
}

module.exports = { logAction };
