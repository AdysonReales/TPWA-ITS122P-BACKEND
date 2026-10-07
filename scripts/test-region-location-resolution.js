const assert = require('node:assert/strict');
const pool = require('../config/db');
const { createDestination } = require('../controllers/destinations.controller');
const { getAccommodations } = require('../controllers/accommodations.controller');
const { resolveLocation } = require('../utils/locationResolver');
const { createDemoAccommodationRecords } = require('../services/demoAccommodation.service');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function main() {
  const cases = [
    ['United States', 'Northeast Ohio', 'Ohio', 'Ohio'],
    ['United States', 'New York City', 'New York', 'New York City'],
    ['Japan', 'Tokyo', undefined, 'Tokyo'],
    ['South Korea', 'Seoul', undefined, 'Seoul'],
    ['South Korea', 'Jeju', undefined, 'Jeju'],
    ['South Korea', 'Jeju Island', undefined, 'Jeju'],
  ];

  for (const [country, area, regionHint, expectedArea] of cases) {
    const result = await resolveLocation(country, area, regionHint);
    assert.equal(result.status, 'resolved', `${country} / ${area} resolves`);
    assert.equal(result.location.area, expectedArea, `${country} / ${area} canonical area`);
    assert.ok(Number.isFinite(result.location.latitude));
    assert.ok(Number.isFinite(result.location.longitude));
  }

  const mismatch = await resolveLocation('United States', 'Northeast Ohio', 'Michigan');
  assert.equal(mismatch.status, 'not_found', 'conflicting region hint is rejected');
  const invalid = await resolveLocation('United States', 'Northeast Imaginary State');
  assert.equal(invalid.status, 'not_found', 'unknown region remains rejected');

  const generated = createDemoAccommodationRecords({ country: 'United States', area: 'Ohio' });
  assert.equal(generated.length, 3);
  assert.ok(generated.every((item) => item.area === 'Ohio'));

  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const storedProperties = [];
  pool.query = async (query, values) => {
    if (query.includes('SELECT * FROM trips')) {
      return { rows: [{ id: 123, user_id: 456 }] };
    }
    if (query.includes('INSERT INTO destinations')) {
      return { rows: [{
        id: 789, trip_id: values[0], location_name: values[1], latitude: values[2],
        longitude: values[3], country: values[5], country_code: values[6], region: values[7],
      }] };
    }
    return { rows: [] };
  };
  pool.connect = async () => ({
    async query(query, values) {
      if (query.includes('SELECT id, country, area, name, address, price')) {
        return {
          rows: storedProperties.filter((item) =>
            item.is_active && values[0].includes(item.country.toLowerCase()) &&
            item.area.toLowerCase() === String(values[1]).toLowerCase(),
          ),
        };
      }
      if (query.includes('SELECT id, is_demo FROM accommodations')) return { rows: [] };
      if (query.includes('INSERT INTO accommodations')) {
        storedProperties.push({
          id: storedProperties.length + 1,
          country: values[0], area: values[1], name: values[2], address: values[3],
          price: values[4], is_active: true,
        });
      }
      return { rows: [] };
    },
    release() {},
  });

  try {
    const saved = response();
    await createDestination({
      body: { trip_id: 123, location_name: 'Northeast Ohio', country: 'United States', region_hint: 'Ohio' },
      user: { id: 456, role: 'customer' },
      get: () => '',
    }, saved);
    assert.equal(saved.statusCode, 201);
    assert.equal(saved.body.destination.location_name, 'Northeast Ohio');
    assert.equal(saved.body.location.area, 'Ohio');

    const inventory = response();
    await getAccommodations({ query: { country: 'United States', area: 'Northeast Ohio', region_hint: 'Ohio' } }, inventory);
    assert.equal(inventory.statusCode, 200);
    assert.equal(inventory.body.accommodations.length, 3);
    assert.ok(inventory.body.accommodations.every((item) => item.area === 'Ohio'));

    const newYork = response();
    await getAccommodations({ query: { country: 'United States', area: 'New York City', region_hint: 'New York' } }, newYork);
    assert.equal(newYork.statusCode, 200);
    assert.equal(newYork.body.accommodations.length, 3);
    assert.ok(newYork.body.accommodations.every((item) => item.area === 'New York City'));

    for (const [area, regionHint, canonicalArea] of [
      ['Seoul', 'Seoul', 'Seoul'],
      ['Jeju Island', 'Jeju', 'Jeju'],
    ]) {
      const inventoryForCity = response();
      await getAccommodations({ query: { country: 'South Korea', area, region_hint: regionHint } }, inventoryForCity);
      assert.equal(inventoryForCity.statusCode, 200, `${area} accommodation lookup`);
      assert.equal(inventoryForCity.body.accommodations.length, 3);
      assert.ok(inventoryForCity.body.accommodations.every((item) => item.area === canonicalArea));
    }
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  }

  console.log('Region and canonical city location resolution passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
