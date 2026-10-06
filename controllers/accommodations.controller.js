const pool = require('../config/db');
const { ensureDemoAccommodations } = require('../services/demoAccommodation.service');

async function initAccommodationsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accommodations (
        id SERIAL PRIMARY KEY,
        country VARCHAR(150) NOT NULL,
        name VARCHAR(180) NOT NULL,
        area VARCHAR(150) NOT NULL,
        address TEXT,
        price DECIMAL(10, 2),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_demo BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_accommodations_location_active
        ON accommodations(country, area, is_active);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS accommodation_id INTEGER
        REFERENCES accommodations(id) ON DELETE RESTRICT;
      ALTER TABLE destinations ADD COLUMN IF NOT EXISTS accommodation_id INTEGER;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'destinations_accommodation_id_fkey'
            AND conrelid = 'destinations'::regclass
        ) THEN
          ALTER TABLE destinations
            ADD CONSTRAINT destinations_accommodation_id_fkey
            FOREIGN KEY (accommodation_id)
            REFERENCES accommodations(id)
            ON DELETE SET NULL;
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_destinations_accommodation_id
        ON destinations(accommodation_id);
    `);
    console.log('Accommodations table verified.');
  } catch (err) {
    console.error('Failed to verify accommodations table:', err.message);
  }
}

async function getAccommodations(req, res) {
  const country = String(req.query.country || '').trim();
  const area = String(req.query.area || '').trim().replace(/\s+/g, ' ');
  if (!country || !area) {
    return res.status(400).json({ message: 'country and area query parameters are required.' });
  }
  try {
    const result = await ensureDemoAccommodations(pool, country, area, req.query.region_hint);
    if (result.status === 'ambiguous') {
      return res.status(409).json({
        code: 'LOCATION_AMBIGUOUS',
        message: 'Select the matching region for this location.',
        candidates: result.candidates,
      });
    }
    if (result.status !== 'resolved') {
      return res.status(422).json({
        code: 'LOCATION_NOT_FOUND',
        message: `Location not found in the open reference dataset: ${country} / ${area}.`,
      });
    }
    return res.status(200).json({ accommodations: result.accommodations });
  } catch (err) {
    console.error('Get accommodations error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

async function getAccommodationById(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, country, area, name, address, price
       FROM accommodations WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Accommodation not found.' });
    return res.status(200).json({ accommodation: result.rows[0] });
  } catch (err) {
    console.error('Get accommodation error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { initAccommodationsTable, getAccommodations, getAccommodationById };
