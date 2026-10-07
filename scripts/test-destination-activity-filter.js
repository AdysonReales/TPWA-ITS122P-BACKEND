const assert = require('node:assert/strict');
const pool = require('../config/db');
const { getActivities } = require('../controllers/activities.controller');
const { normalizeCountry, normalizeLookup } = require('../utils/accommodationLocation');
const { parseRows } = require('./seed-activity-recommendations');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function main() {
  assert.equal(normalizeCountry('South Korea'), 'South Korea');
  assert.equal(normalizeCountry('Korea'), 'South Korea');
  assert.equal(normalizeCountry('Republic of Korea'), 'South Korea');
  assert.equal(normalizeCountry('Korea, Republic of'), 'South Korea');
  assert.equal(normalizeCountry('Hong Kong SAR'), 'Hong Kong');
  assert.equal(normalizeCountry('Macao'), 'Macau');
  assert.equal(normalizeLookup('Dōtonbori'), 'dotonbori');

  const originalQuery = pool.query;
  const queries = [];
  const recommendationRows = parseRows().map((item, index) => ({
    id: -(index + 1),
    title: item.title,
    destination: item.destinationName,
    destination_name: item.destinationName,
    destination_aliases: item.aliases,
    destination_country: item.country,
    category: item.category,
    category_type: item.categoryType,
  }));
  pool.query = async (query, values) => {
    queries.push({ query, values });
    if (query.includes('FROM activity_recommendations')) {
      return { rows: recommendationRows };
    }
    return { rows: [] };
  };

  try {
    const expected = [
      ['Tokyo', 'Japan', 'Tokyo'], ['Kyoto', 'Japan', 'Kyoto'], ['Osaka', 'Japan', 'Osaka'],
      ['Seoul', 'Korea', 'Seoul'], ['Busan', 'Republic of Korea', 'Busan'],
      ['Jeju', 'South Korea', 'Jeju Island'], ['Hong Kong', 'Hong Kong SAR', 'Hong Kong'],
      ['Macao', 'Macau', 'Macau'],
      ['Manila', 'Philippines', 'Manila'], ['Cebu', 'Philippines', 'Cebu City'],
      ['Bohol', 'Philippines', 'Bohol'], ['Baguio', 'Philippines', 'Baguio'],
      ['El Nido', 'Philippines', 'El Nido, Palawan'], ['Coron', 'Philippines', 'Coron, Palawan'],
      ['Taipei', 'Taiwan', 'Taipei'], ['Kuala Lumpur', 'Malaysia', 'Kuala Lumpur'],
      ['Penang', 'Malaysia', 'Penang'], ['Singapore', 'Singapore', 'Singapore'],
      ['Bangkok', 'Thailand', 'Bangkok'], ['Chiang Mai', 'Thailand', 'Chiang Mai'],
      ['Phuket', 'Thailand', 'Phuket'], ['Bali', 'Indonesia', 'Bali'],
      ['Jakarta', 'Indonesia', 'Jakarta'], ['Yogyakarta', 'Indonesia', 'Yogyakarta'],
      ['Hanoi', 'Vietnam', 'Hanoi'], ['Ho Chi Minh', 'Vietnam', 'Ho Chi Minh City'],
      ['Da Nang', 'Vietnam', 'Da Nang'], ['Beijing', 'China', 'Beijing'],
      ['Shanghai', 'China', 'Shanghai'], ['Chengdu', 'China', 'Chengdu'],
    ];
    for (const [destination, country, canonicalDestination] of expected) {
      const res = response();
      await getActivities({ query: { destination, country } }, res);
      assert.equal(res.statusCode, 200, `${country} / ${destination} status`);
      assert.equal(res.body.activities.length, 5, `${country} / ${destination} recommendation count`);
      assert.ok(res.body.activities.every((item) => item.destination === canonicalDestination));
      assert.ok(res.body.activities.every((item) => !('destination_aliases' in item)));
    }
    assert.match(queries[0].query, /LOWER\(d\.location_name\)/);
    assert.match(queries[0].query, /d\.country IS NULL OR LOWER\(d\.country\)/);
    assert.match(queries[0].query, /JOIN destinations d ON a\.destination_id = d\.id/);
    assert.deepEqual(queries[0].values, ['Tokyo', 'Japan']);
    assert.match(queries[1].query, /LOWER\(country\) = ANY\(\$1::text\[\]\)/);
    assert.deepEqual(queries[1].values, [['japan', 'jp']]);

    const mismatch = response();
    await getActivities({ query: { destination: 'Busan', country: 'Japan' } }, mismatch);
    assert.equal(mismatch.body.activities.length, 0, 'Japan must not return Busan, South Korea');

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
