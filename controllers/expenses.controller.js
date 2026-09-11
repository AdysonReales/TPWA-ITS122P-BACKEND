const pool = require('../config/db');
const { logAction } = require('../utils/logger');

/**
 * Automatically ensures the `expenses` table exists in PostgreSQL on startup.
 */
async function initExpensesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        items INTEGER NOT NULL DEFAULT 1,
        category VARCHAR(50) NOT NULL,
        cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
    `);
    console.log('Expenses table verified / initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize expenses table:', err);
  }
}

// GET /api/trips/:tripId/budget
async function getTripBudget(req, res) {
  try {
    const { tripId } = req.params;
    const { id: userId, role } = req.user;

    const tripResult = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    const trip = tripResult.rows[0];

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found.' });
    }

    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    const expensesResult = await pool.query(
      `SELECT id, trip_id, name, items, category, cost::float, TO_CHAR(date, 'YYYY-MM-DD') AS date, created_at
       FROM expenses
       WHERE trip_id = $1
       ORDER BY date DESC, id DESC`,
      [tripId]
    );

    return res.status(200).json({
      balance: parseFloat(trip.total_budget || 0),
      expenses: expensesResult.rows,
    });
  } catch (err) {
    console.error('Get trip budget error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/trips/:tripId/budget/balance
async function addBalance(req, res) {
  try {
    const { tripId } = req.params;
    const { id: userId, role } = req.user;
    const { amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Valid positive amount is required.' });
    }

    const tripResult = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    const trip = tripResult.rows[0];

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found.' });
    }

    if (role === 'customer' && trip.user_id !== userId) {
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    const updateResult = await pool.query(
      `UPDATE trips
       SET total_budget = ROUND((COALESCE(total_budget, 0) + $1)::numeric, 2)
       WHERE id = $2
       RETURNING total_budget::float AS balance`,
      [parsedAmount, tripId]
    );

    const newBalance = updateResult.rows[0].balance;

    logAction({
      userId,
      actionType: 'ADD_BALANCE',
      tableAffected: 'trips',
      recordId: tripId,
      description: `Added ₱${parsedAmount} balance to trip #${tripId}`,
    });

    return res.status(200).json({
      message: 'Balance added.',
      balance: newBalance,
    });
  } catch (err) {
    console.error('Add balance error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/trips/:tripId/budget/expenses
async function addExpense(req, res) {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;
    const { id: userId, role } = req.user;
    const { name, items, category, cost, date } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Expense name is required.' });
    }

    const parsedCost = parseFloat(cost);
    if (isNaN(parsedCost) || parsedCost <= 0) {
      return res.status(400).json({ message: 'Valid positive cost is required.' });
    }

    const parsedItems = Math.max(1, parseInt(items, 10) || 1);
    const expenseCategory = category || 'Other';
    const expenseDate = date || new Date().toISOString().split('T')[0];

    await client.query('BEGIN');

    const tripResult = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
    const trip = tripResult.rows[0];

    if (!trip) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Trip not found.' });
    }

    if (role === 'customer' && trip.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    const expenseInsert = await client.query(
      `INSERT INTO expenses (trip_id, name, items, category, cost, date)
       VALUES ($1, $2, $3, $4, $5, $6::date)
       RETURNING id, trip_id, name, items, category, cost::float, TO_CHAR(date, 'YYYY-MM-DD') AS date, created_at`,
      [tripId, name.trim(), parsedItems, expenseCategory, parsedCost, expenseDate]
    );

    const newExpense = expenseInsert.rows[0];

    // Subtract cost from trip total_budget
    const budgetUpdate = await client.query(
      `UPDATE trips
       SET total_budget = ROUND((COALESCE(total_budget, 0) - $1)::numeric, 2)
       WHERE id = $2
       RETURNING total_budget::float AS balance`,
      [parsedCost, tripId]
    );

    const newBalance = budgetUpdate.rows[0].balance;

    await client.query('COMMIT');

    logAction({
      userId,
      actionType: 'ADD_EXPENSE',
      tableAffected: 'expenses',
      recordId: newExpense.id,
      description: `Added expense "${name}" (₱${parsedCost}) to trip #${tripId}`,
    });

    return res.status(201).json({
      message: 'Expense added.',
      expense: newExpense,
      balance: newBalance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add expense error:', err);
    return res.status(500).json({ message: 'Server error.' });
  } finally {
    client.release();
  }
}

// DELETE /api/trips/:tripId/budget/expenses/:expenseId
async function deleteExpense(req, res) {
  const client = await pool.connect();
  try {
    const { tripId, expenseId } = req.params;
    const { id: userId, role } = req.user;

    await client.query('BEGIN');

    const tripResult = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
    const trip = tripResult.rows[0];

    if (!trip) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Trip not found.' });
    }

    if (role === 'customer' && trip.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'You do not have access to this trip.' });
    }

    const expenseResult = await client.query(
      'DELETE FROM expenses WHERE id = $1 AND trip_id = $2 RETURNING cost::float',
      [expenseId, tripId]
    );

    const deletedExpense = expenseResult.rows[0];
    if (!deletedExpense) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Expense not found.' });
    }

    // Refund cost to trip total_budget
    const refundCost = deletedExpense.cost;
    const budgetUpdate = await client.query(
      `UPDATE trips
       SET total_budget = ROUND((COALESCE(total_budget, 0) + $1)::numeric, 2)
       WHERE id = $2
       RETURNING total_budget::float AS balance`,
      [refundCost, tripId]
    );

    const newBalance = budgetUpdate.rows[0].balance;

    await client.query('COMMIT');

    logAction({
      userId,
      actionType: 'DELETE_EXPENSE',
      tableAffected: 'expenses',
      recordId: expenseId,
      description: `Deleted expense #${expenseId} and refunded ₱${refundCost} to trip #${tripId}`,
    });

    return res.status(200).json({
      message: 'Expense deleted and refunded.',
      balance: newBalance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete expense error:', err);
    return res.status(500).json({ message: 'Server error.' });
  } finally {
    client.release();
  }
}

module.exports = {
  initExpensesTable,
  getTripBudget,
  addBalance,
  addExpense,
  deleteExpense,
};