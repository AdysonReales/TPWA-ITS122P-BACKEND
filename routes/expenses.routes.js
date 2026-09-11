const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  getTripBudget,
  addBalance,
  addExpense,
  deleteExpense,
} = require('../controllers/expenses.controller');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

// All budget routes require authentication
router.use(authenticateToken, authorizeRoles('admin', 'staff', 'customer'));

// Mounted under /api/trips/:tripId/budget
router.get('/', getTripBudget);
router.post('/balance', addBalance);
router.post('/expenses', addExpense);
router.delete('/expenses/:expenseId', deleteExpense);

module.exports = router;