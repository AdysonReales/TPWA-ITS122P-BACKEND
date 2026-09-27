const pool = require('../config/db');

async function initCountryProfilesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS country_profiles (
        id                   SERIAL PRIMARY KEY,
        country_name         VARCHAR(150) NOT NULL UNIQUE,
        continent            VARCHAR(100) NOT NULL,
        capital              VARCHAR(100),
        language             VARCHAR(100),
        currency             VARCHAR(50),
        population           BIGINT,
        description          TEXT,
        best_destinations    JSONB NOT NULL DEFAULT '[]'::jsonb,
        budget_daily_cost    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        midrange_daily_cost  NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        luxury_daily_cost    NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        image_url            TEXT,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE country_profiles ENABLE ROW LEVEL SECURITY;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE tablename = 'country_profiles' 
          AND policyname = 'Allow public read access on country_profiles'
        ) THEN
          CREATE POLICY "Allow public read access on country_profiles"
          ON country_profiles FOR SELECT TO public USING (true);
        END IF;
      END $$;
    `);

    // Seed defaults if empty
    const checkCount = await pool.query('SELECT COUNT(*) FROM country_profiles');
    if (parseInt(checkCount.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO country_profiles (
          country_name, continent, capital, language, currency, population, description,
          best_destinations, budget_daily_cost, midrange_daily_cost, luxury_daily_cost, image_url
        ) VALUES
        (
          'Philippines',
          'Asia',
          'Manila',
          'Filipino, English',
          'PHP',
          115000000,
          'Archipelago of over 7,000 islands known for powdery white-sand beaches, emerald waters, warm hospitality, and vibrant dive sites.',
          '["Boracay", "Palawan (El Nido & Coron)", "Siargao Island", "Cebu & Bohol", "Batanes"]'::jsonb,
          1800.00,
          4500.00,
          14000.00,
          'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?auto=format&fit=crop&w=1200&q=80'
        ),
        (
          'Japan',
          'Asia',
          'Tokyo',
          'Japanese',
          'JPY',
          125000000,
          'A harmonious blend of centuries-old Shinto traditions, serene bamboo groves, hyper-modern futuristic metropolises, and world-class culinary craftsmanship.',
          '["Kyoto Ancient Temples", "Tokyo Shibuya & Shinjuku", "Mount Fuji & Hakone", "Osaka Dotonbori", "Hokkaido Furano"]'::jsonb,
          3500.00,
          8500.00,
          25000.00,
          'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80'
        ),
        (
          'France',
          'Europe',
          'Paris',
          'French',
          'EUR',
          67800000,
          'Famous for world-defining art museums, iconic monuments, world-class gastronomy, sun-drenched Côte d''Azur coastlines, and picturesque vineyards.',
          '["Paris & Versailles", "French Riviera (Nice & Cannes)", "Provence Lavender Fields", "Mont Saint-Michel", "Chamonix Mont-Blanc"]'::jsonb,
          4200.00,
          9800.00,
          28000.00,
          'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'
        ),
        (
          'Italy',
          'Europe',
          'Rome',
          'Italian',
          'EUR',
          59000000,
          'A living open-air museum boasting Renaissance masterpieces, dramatic Amalfi cliffside towns, Venetian canals, and mouthwatering regional cuisine.',
          '["Rome Colosseum & Vatican", "Florence & Tuscany", "Venice Canals", "Amalfi Coast & Positano", "Cinque Terre"]'::jsonb,
          4000.00,
          9200.00,
          26000.00,
          'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1200&q=80'
        ),
        (
          'United States',
          'Americas',
          'Washington, D.C.',
          'English',
          'USD',
          335000000,
          'A vast and diverse continent-spanning nation featuring dramatic national parks, world-famous skylines, coast-to-coast road trips, and global cultural hubs.',
          '["New York City", "Grand Canyon National Park", "California Pacific Coast", "Hawaii (Maui & Oahu)", "Yellowstone"]'::jsonb,
          4800.00,
          11000.00,
          32000.00,
          'https://images.unsplash.com/photo-1485738422979-f5c462d49f74?auto=format&fit=crop&w=1200&q=80'
        )
        ON CONFLICT (country_name) DO NOTHING;
      `);
    }
    console.log('Country profiles table verified and seeded.');
  } catch (err) {
    console.error('Failed to verify country_profiles table:', err.message);
  }
}

// GET /api/country-profiles
async function getAllCountryProfiles(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM country_profiles ORDER BY country_name ASC'
    );
    return res.status(200).json({ profiles: result.rows });
  } catch (err) {
    console.error('Get all country profiles error:', err);
    return res.status(500).json({ message: 'Server error fetching country profiles.' });
  }
}

// GET /api/country-profiles/:country_name
async function getCountryProfileByName(req, res) {
  try {
    const { country_name } = req.params;
    const result = await pool.query(
      'SELECT * FROM country_profiles WHERE LOWER(country_name) = LOWER($1)',
      [country_name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Country profile not found.' });
    }

    return res.status(200).json({ profile: result.rows[0] });
  } catch (err) {
    console.error('Get country profile by name error:', err);
    return res.status(500).json({ message: 'Server error fetching country profile.' });
  }
}

module.exports = {
  initCountryProfilesTable,
  getAllCountryProfiles,
  getCountryProfileByName,
};
