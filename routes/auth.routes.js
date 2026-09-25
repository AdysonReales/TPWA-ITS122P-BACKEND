const express = require('express');
const router = express.Router();
const {
  register,
  login,
  logout,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
} = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticateToken, getCurrentUser);

// Email verification routes
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

// Password recovery routes
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
