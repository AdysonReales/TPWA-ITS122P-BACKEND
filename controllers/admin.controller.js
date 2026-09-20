const pool = require('../config/db');

// GET /api/admin/reports
async function getReports(req, res) {
  try {
    // 1. Total Registered Users
    const userCountRes = await pool.query("SELECT COUNT(*) FROM users WHERE is_active = true");
    const totalUsers = parseInt(userCountRes.rows[0].count, 10) || 0;

    // 2. Total Trips Planned
    const tripCountRes = await pool.query("SELECT COUNT(*) FROM trips");
    const totalTrips = parseInt(tripCountRes.rows[0].count, 10) || 0;

    // 3. Total Bookings Made
    const bookingsCountRes = await pool.query("SELECT COUNT(*) FROM bookings");
    const totalBookings = parseInt(bookingsCountRes.rows[0].count, 10) || 0;

    // 4. Active Ongoing Trips
    const activeTripsRes = await pool.query(`
      SELECT COUNT(*) 
      FROM trips 
      WHERE (start_date >= date_trunc('month', current_date) AND start_date < (date_trunc('month', current_date) + interval '1 month'))
      OR status IN ('ongoing', 'confirmed')
    `);
    const activeTrips = parseInt(activeTripsRes.rows[0].count, 10) || 0;

    return res.status(200).json({
      metrics: {
        totalUsers,
        totalTrips,
        totalBookings,
        activeTrips,
      },
    });
  } catch (err) {
    console.error('Get reports error:', err);
    return res.status(500).json({ message: 'Server error retrieving system reports.' });
  }
}

module.exports = { getReports };