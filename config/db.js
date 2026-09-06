const { Pool } = require('pg');
require('dotenv').config();

// Supabase Postgres requires SSL. `rejectUnauthorized: false` is the
// standard approach for Supabase's pooled connection string.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('connect', () => {
  console.log('Connected to Supabase Postgres database.');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(1);
});

module.exports = pool;
