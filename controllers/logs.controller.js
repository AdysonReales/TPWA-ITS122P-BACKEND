const pool = require('../config/db');

// GET /api/logs  (admin only, optional ?user_id= filter)
async function getLogs(req, res) {
  try {
    const { user_id } = req.query;

    const columnsResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'system_logs'`
    );
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));
    const column = (...candidates) => candidates.find((candidate) => columns.has(candidate));
    const actorColumn = column('user_id', 'userid');
    const actionColumn = column('action_type', 'actiontype');
    const tableColumn = column('table_affected', 'tableaffected');
    const recordColumn = column('record_id', 'recordid');
    const createdColumn = column('created_at', 'createdat');
    const descriptionColumn = column('description');
    const idColumn = column('id', 'logid');
    if (![actorColumn, actionColumn, tableColumn, recordColumn, createdColumn, descriptionColumn, idColumn].every(Boolean)) {
      throw new Error('System audit log is missing required columns.');
    }

    const quoted = (name) => `"${name}"`;
    const whereClause = user_id ? `WHERE l.${quoted(actorColumn)} = $1` : '';
    const values = user_id ? [user_id] : [];
    const result = await pool.query(
      `SELECT
         l.${quoted(idColumn)} AS id,
         l.${quoted(actorColumn)} AS user_id,
         u.full_name AS user_name,
         l.${quoted(actionColumn)} AS action_type,
         l.${quoted(tableColumn)} AS table_affected,
         l.${quoted(recordColumn)} AS record_id,
         l.${quoted(descriptionColumn)} AS description,
         l.${quoted(createdColumn)} AS created_at
       FROM system_logs l
       LEFT JOIN users u ON u.id = l.${quoted(actorColumn)}
       ${whereClause}
       ORDER BY l.${quoted(createdColumn)} DESC
       LIMIT 200`,
      values
    );

    return res.status(200).json({ logs: result.rows });
  } catch (err) {
    console.error('Get logs error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getLogs };
