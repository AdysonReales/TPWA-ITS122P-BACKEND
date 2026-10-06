const { resolveLocation } = require('../utils/locationResolver');
const { countryQueryVariants, normalizeLookup } = require('../utils/accommodationLocation');

const PROPERTY_TIERS = [
  { tier: 'value', suffix: 'Central Hotel' },
  { tier: 'standard', suffix: 'Garden Stay' },
  { tier: 'premium', suffix: 'Premium Suites' },
];

const COUNTRY_TIER_PHP = {
  Japan: 1000,
  'South Korea': 800,
  Taiwan: 700,
  Singapore: 1300,
  Philippines: 0,
  Brunei: 400,
  France: 1100,
  Italy: 1050,
  'United States': 1300,
};
const DEFAULT_COUNTRY_TIER_PHP = 0;

const AREA_TIER_PHP = {
  Tokyo: 900,
  Osaka: 500,
  Kyoto: 600,
  Seoul: 800,
  Busan: 450,
  Jeju: 500,
  Taipei: 650,
  Singapore: 1100,
  Manila: 250,
  Cebu: 200,
  'Bandar Seri Begawan': 250,
  'El Nido': 450,
  Coron: 350,
  Batanes: 300,
  Paris: 1200,
  Rome: 1000,
  'New York City': 1400,
  Hakone: 550,
  Versailles: 650,
  Nice: 850,
  Cannes: 900,
  Florence: 750,
  Tuscany: 650,
  Venice: 950,
  Positano: 900,
  'Grand Canyon': 750,
  Maui: 1100,
  Bali: 850,
};
const PROPERTY_TIER_PHP = { value: 0, standard: 650, premium: 1300 };
const BASE_PRICE_PHP = 1800;

function demoPrice(country, area, tier) {
  return BASE_PRICE_PHP +
    (COUNTRY_TIER_PHP[country] ?? DEFAULT_COUNTRY_TIER_PHP) +
    (AREA_TIER_PHP[area] ?? 0) +
    PROPERTY_TIER_PHP[tier];
}

function createDemoAccommodationRecords(location) {
  return PROPERTY_TIERS.map((property) => ({
    country: location.country,
    area: location.area,
    name: `LakBye ${location.area} ${property.suffix}`,
    address: `${location.area}, ${location.country}`,
    price: demoPrice(location.country, location.area, property.tier),
    is_active: true,
    is_demo: true,
  }));
}

async function queryActiveAccommodations(queryable, location) {
  const result = await queryable.query(
    `SELECT id, country, area, name, address, price
     FROM accommodations
     WHERE LOWER(BTRIM(country)) = ANY($1::text[])
       AND LOWER(REGEXP_REPLACE(BTRIM(area), '\\s+', ' ', 'g')) = LOWER($2)
       AND is_active = TRUE
     ORDER BY name, id`,
    [countryQueryVariants(location.country), location.area]
  );
  return result.rows;
}

async function ensureDemoAccommodations(pool, country, area, regionHint) {
  const resolution = await resolveLocation(country, area, regionHint);
  if (resolution.status !== 'resolved') return { ...resolution, generated: 0 };

  const location = resolution.location;
  const countryVariants = countryQueryVariants(location.country);
  const locationKey = `${normalizeLookup(location.country)}|${normalizeLookup(location.area)}`;
  const properties = createDemoAccommodationRecords(location);
  const client = await pool.connect();
  let generated = 0;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [locationKey]);

    const activeRows = await queryActiveAccommodations(client, location);
    if (activeRows.length) {
      await client.query('COMMIT');
      return { status: 'resolved', location, accommodations: activeRows, generated };
    }

    for (const property of properties) {
      const existing = await client.query(
        `SELECT id, is_demo FROM accommodations
         WHERE LOWER(BTRIM(country)) = ANY($1::text[])
           AND LOWER(REGEXP_REPLACE(BTRIM(area), '\\s+', ' ', 'g')) = LOWER($2)
           AND LOWER(BTRIM(name)) = LOWER($3)
         ORDER BY id LIMIT 1 FOR UPDATE`,
        [countryVariants, location.area, property.name]
      );

      if (existing.rows[0] && !existing.rows[0].is_demo) {
        throw new Error(`A non-demo accommodation uses the reserved demo name: ${property.name}`);
      }

      if (existing.rows[0]) {
        await client.query(
          `UPDATE accommodations
           SET address = $1, price = $2, is_active = TRUE, updated_at = NOW()
           WHERE id = $3`,
          [property.address, property.price, existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO accommodations (country, area, name, address, price, is_active, is_demo)
           VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)`,
          [property.country, property.area, property.name, property.address, property.price]
        );
      }
      generated += 1;
    }

    const accommodations = await queryActiveAccommodations(client, location);
    await client.query('COMMIT');
    return { status: 'resolved', location, accommodations, generated };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createDemoAccommodationRecords,
  demoPrice,
  ensureDemoAccommodations,
};
