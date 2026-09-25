const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { getReports } = require('../controllers/admin.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// Only allow Admins to access these aggregate system reports
router.get('/reports', authenticateToken, authorizeRoles('admin'), getReports);

// Maintenance: One-time backfill verification status routes
router.get('/backfill-check', async (req, res) => {
  const authHeader = req.headers['x-maintenance-key'] || req.query.key;
  if (authHeader !== 'lakbye_backfill_2026') {
    return res.status(401).json({ message: 'Unauthorized maintenance key.' });
  }

  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS total_users, 
             COUNT(*) FILTER (WHERE is_verified = TRUE) AS verified, 
             COUNT(*) FILTER (WHERE is_verified = FALSE) AS unverified 
      FROM users
    `);
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Backfill check error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/backfill-execute', async (req, res) => {
  const authHeader = req.headers['x-maintenance-key'] || req.query.key;
  if (authHeader !== 'lakbye_backfill_2026') {
    return res.status(401).json({ message: 'Unauthorized maintenance key.' });
  }

  try {
    const updateResult = await pool.query(`
      UPDATE users 
      SET is_verified = TRUE 
      WHERE is_verified = FALSE
    `);
    const countResult = await pool.query(`
      SELECT COUNT(*) AS total_users, 
             COUNT(*) FILTER (WHERE is_verified = TRUE) AS verified, 
             COUNT(*) FILTER (WHERE is_verified = FALSE) AS unverified 
      FROM users
    `);
    return res.status(200).json({
      updatedRows: updateResult.rowCount,
      statsAfter: countResult.rows[0],
    });
  } catch (err) {
    console.error('Backfill execute error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
