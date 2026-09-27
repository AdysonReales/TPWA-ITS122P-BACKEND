const pool = require('../config/db');

/**
 * Initializes the feedback table and seeds initial approved traveler reviews if empty.
 */
async function initFeedbackTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        country_name VARCHAR(150) NOT NULL,
        title VARCHAR(150) NOT NULL,
        comment TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        status VARCHAR(20) NOT NULL DEFAULT 'approved',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
      CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
    `);

    // Check if initial feedback exists; if not, seed with system admin / existing users
    const countRes = await pool.query('SELECT COUNT(*) FROM feedback');
    if (parseInt(countRes.rows[0].count, 10) === 0) {
      const adminRes = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
      if (adminRes.rows.length > 0) {
        const seedUserId = adminRes.rows[0].id;
        await pool.query(`
          INSERT INTO feedback (user_id, country_name, title, comment, rating, status) VALUES
          ($1, 'Philippines', 'Seamless Planning!', 'Our recent 5-day family trip to El Nido was an absolute dream, all thanks to the seamless planning and intuitive itineraries!', 5, 'approved'),
          ($1, 'Japan', 'Goated Planner', 'Will be using this to plan our Tokyo and Kyoto barkada trips from now on! Budget and route tracking were super accurate.', 5, 'approved'),
          ($1, 'France', 'An Unforgettable, Stress-Free Getaway!', 'From start to finish, LakBye made planning our dream European vacation completely effortless. Every detail was organized flawlessly.', 5, 'approved'),
          ($1, 'Philippines', 'Flawless from Start to Finish', 'LakBye handled all our bookings seamlessly. No flight delays, incredible stays, and zero hassle. Truly the easiest travel companion!', 5, 'approved'),
          ($1, 'Italy', 'The perfect planner', 'This is my first time ever leaving a travel app review, but this is hands down the BEST travel planner. Every feature is intuitive and gorgeous.', 5, 'approved'),
          ($1, 'United States', 'Solid travel planner', 'There is so much you can add, organize, and accomplish with LakBye. The budget and packing integration saved us so much time.', 5, 'approved')
        `, [seedUserId]);
        console.log('Seeded initial approved traveler reviews into feedback table.');
      }
    }
    console.log('Feedback table initialized and verified.');
  } catch (err) {
    console.error('Failed to initialize feedback table:', err);
  }
}

// GET /api/feedback (Public / Protected)
// Returns approved reviews with user's full_name and avatar_url; for admin, returns all reviews if requested.
async function getFeedback(req, res) {
  try {
    const { status, all } = req.query;
    const isAdmin = req.user && req.user.role === 'admin';

    let queryText = `
      SELECT f.id, f.user_id, f.country_name, f.title, f.comment, f.rating, f.status, f.created_at,
             u.full_name AS user_name, u.avatar_url, u.username
      FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id
    `;
    const queryParams = [];

    if (all === 'true' && isAdmin) {
      if (status) {
        queryParams.push(status);
        queryText += ` WHERE f.status = $1`;
      }
    } else {
      queryParams.push('approved');
      queryText += ` WHERE f.status = $1`;
    }

    queryText += ` ORDER BY f.created_at DESC LIMIT 50`;

    const result = await pool.query(queryText, queryParams);
    return res.status(200).json({ feedback: result.rows });
  } catch (err) {
    console.error('Get feedback error:', err);
    return res.status(500).json({ message: 'Server error retrieving feedback.' });
  }
}

// POST /api/feedback (Requires Authentication)
async function submitFeedback(req, res) {
  try {
    const userId = req.user.id;
    const { country_name, title, comment, rating } = req.body;

    if (!country_name || !country_name.trim()) {
      return res.status(400).json({ message: 'Country or place visited is required.' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Review title is required.' });
    }
    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Review comment is required.' });
    }
    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5 stars.' });
    }

    const result = await pool.query(
      `INSERT INTO feedback (user_id, country_name, title, comment, rating, status)
       VALUES ($1, $2, $3, $4, $5, 'approved')
       RETURNING *`,
      [userId, country_name.trim(), title.trim(), comment.trim(), numRating]
    );

    return res.status(201).json({
      message: 'Thank you for your feedback! Your review has been submitted.',
      feedback: result.rows[0],
    });
  } catch (err) {
    console.error('Submit feedback error:', err);
    return res.status(500).json({ message: 'Server error submitting feedback.' });
  }
}

// PUT /api/feedback/:id/status (Admin Only Moderation)
async function updateFeedbackStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE feedback SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Feedback entry not found.' });
    }

    return res.status(200).json({
      message: `Feedback status updated to ${status}.`,
      feedback: result.rows[0],
    });
  } catch (err) {
    console.error('Update feedback status error:', err);
    return res.status(500).json({ message: 'Server error updating feedback status.' });
  }
}

// DELETE /api/feedback/:id (Admin Only)
async function deleteFeedback(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM feedback WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Feedback entry not found.' });
    }
    return res.status(200).json({ message: 'Feedback entry deleted successfully.' });
  } catch (err) {
    console.error('Delete feedback error:', err);
    return res.status(500).json({ message: 'Server error deleting feedback.' });
  }
}

module.exports = {
  initFeedbackTable,
  getFeedback,
  submitFeedback,
  updateFeedbackStatus,
  deleteFeedback,
};
