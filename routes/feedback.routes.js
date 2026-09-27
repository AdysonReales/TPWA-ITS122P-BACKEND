const express = require('express');
const router = express.Router();
const {
  getFeedback,
  submitFeedback,
  updateFeedbackStatus,
  deleteFeedback,
} = require('../controllers/feedback.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// Optional authentication helper: if bearer token or cookie present, extracts req.user, else continues as guest
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.token;
  if (!token) {
    return next();
  }
  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (!err && user) {
      req.user = user;
    }
    next();
  });
}

// GET /api/feedback: public access to approved reviews (or all if admin)
router.get('/', optionalAuthenticateToken, getFeedback);

// POST /api/feedback: authenticated users only
router.post('/', authenticateToken, submitFeedback);

// PUT /api/feedback/:id/status: admin only
router.put('/:id/status', authenticateToken, authorizeRoles('admin'), updateFeedbackStatus);

// DELETE /api/feedback/:id: admin only
router.delete('/:id', authenticateToken, authorizeRoles('admin'), deleteFeedback);

module.exports = router;
