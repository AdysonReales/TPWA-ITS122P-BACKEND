const assert = require('node:assert/strict');
const pool = require('../config/db');
const { getActivities } = require('../controllers/activities.controller');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function main() {
  const originalQuery = pool.query;
  let capturedQuery;
  let capturedValues;
  pool.query = async (query, values) => {
    capturedQuery = query;
    capturedValues = values;
    return { rows: [{ id: 5, title: 'Tokyo walking tour', destination: 'Tokyo, Japan', destination_country: 'Japan', category: 'Sightseeing' }] };
  };

  try {
    const res = response();
    await getActivities({ query: { destination: 'Tokyo', country: 'Japan' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.activities[0].title, 'Tokyo walking tour');
    assert.match(capturedQuery, /LOWER\(d\.location_name\)/);
    assert.match(capturedQuery, /d\.country IS NULL OR LOWER\(d\.country\)/);
    assert.match(capturedQuery, /JOIN destinations d ON a\.destination_id = d\.id/);
    assert.deepEqual(capturedValues, ['Tokyo', 'Japan']);

    const invalid = response();
    await getActivities({ query: { destination: ' '.repeat(151) } }, invalid);
    assert.equal(invalid.statusCode, 400);
  } finally {
    pool.query = originalQuery;
  }

  console.log('Destination and country activity filtering passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
