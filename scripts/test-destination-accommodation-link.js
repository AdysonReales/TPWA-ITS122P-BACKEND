// Controller-level checks with an in-memory PostgreSQL pool. No database writes.
const assert = require('node:assert/strict');
const Module = require('node:module');

const propertyRows = new Map([
  [11, { id: 11, country: 'Japan', area: 'Tokyo', name: 'Tokyo Demo Stay', is_active: true }],
  [12, { id: 12, country: 'South Korea', area: 'Busan', name: 'Busan Demo Stay', is_active: true }],
  [13, { id: 13, country: 'Japan', area: 'Sapporo', name: 'Sapporo Central Hotel', is_active: true }],
  [14, { id: 14, country: 'Japan', area: 'Tokyo', name: 'Inactive Tokyo Stay', is_active: false }],
]);
const trip = { id: 1, user_id: 7 };
let destination = null;
let nextId = 40;
const fakePool = {
  async query(sql, values = []) {
    if (sql.includes('FROM trips WHERE id = $1')) return { rows: [trip] };
    if (sql.includes('FROM accommodations WHERE id = $1')) return { rows: propertyRows.has(Number(values[0])) ? [propertyRows.get(Number(values[0]))] : [] };
    if (sql.includes('SELECT * FROM destinations WHERE id = $1')) return { rows: destination ? [{ ...destination }] : [] };
    if (sql.includes('INSERT INTO destinations')) {
      destination = {
        id: nextId++, trip_id: Number(values[0]), location_name: values[1], latitude: values[2], longitude: values[3],
        order_sequence: values[4], country: values[5], country_code: values[6], region: values[7],
        parent_destination_id: values[8], days: values[9], accommodation_id: values[10], accommodation: values[11],
        activities: values[12], transportation: values[13],
      };
      return { rows: [{ ...destination }] };
    }
    if (sql.includes('UPDATE destinations')) {
      destination = {
        ...destination,
        location_name: values[12] ? values[0] : destination.location_name,
        latitude: values[12] ? values[1] : destination.latitude,
        longitude: values[12] ? values[2] : destination.longitude,
        country: values[12] ? values[4] : destination.country,
        country_code: values[12] ? values[5] : destination.country_code,
        region: values[12] ? values[6] : destination.region,
        accommodation_id: values[13], accommodation: values[14],
      };
      return { rows: [{ ...destination }] };
    }
    if (sql.includes('SELECT * FROM destinations WHERE trip_id = $1')) return { rows: destination ? [{ ...destination }] : [] };
    throw new Error(`Unexpected mocked query: ${sql}`);
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/db' && parent?.filename.endsWith('destinations.controller.js')) return fakePool;
  return originalLoad.call(this, request, parent, isMain);
};
const controller = require('../controllers/destinations.controller');
Module._load = originalLoad;

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function run() {
  const customer = { id: 7, role: 'customer' };
  const create = async (body) => {
    const res = response();
    await controller.createDestination({ body: { trip_id: 1, country: 'Japan', location_name: 'Tokyo', ...body }, user: customer }, res);
    return res;
  };

  let res = await create({ accommodation_id: 11, accommodation: 'Forged property label' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.destination.accommodation_id, 11);
  assert.equal(res.body.destination.accommodation, 'Tokyo Demo Stay');
  const tokyoId = res.body.destination.id;

  res = await create({ accommodation_id: 12 });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'ACCOMMODATION_LOCATION_MISMATCH');
  res = await create({ accommodation_id: 999 });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'ACCOMMODATION_NOT_FOUND');
  res = await create({ accommodation_id: 14 });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'ACCOMMODATION_NOT_AVAILABLE');

  res = await create({ country: 'Japan', location_name: 'Sapporo', accommodation_id: 13 });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.destination.accommodation_id, 13);
  assert.equal(res.body.destination.accommodation, 'Sapporo Central Hotel');

  destination = { ...destination, id: tokyoId, country: 'Japan', location_name: 'Tokyo', country_code: 'JP', region: 'Tokyo', accommodation_id: 11, accommodation: 'Tokyo Demo Stay' };
  res = response();
  await controller.updateDestination({ params: { id: String(tokyoId) }, body: { country: 'Japan', location_name: 'Osaka' }, user: customer }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.destination.accommodation_id, null);
  assert.equal(res.body.destination.accommodation, null);

  destination = { ...destination, country: 'Japan', location_name: 'Tokyo', accommodation_id: null, accommodation: 'Legacy Hotel Text' };
  res = response();
  await controller.getDestinationById({ params: { id: String(tokyoId) }, user: customer }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.destination.accommodation_id, null);
  assert.equal(res.body.destination.accommodation, 'Legacy Hotel Text');

  destination.accommodation_id = 11;
  destination.accommodation = 'Tokyo Demo Stay';
  res = response();
  await controller.updateDestination({ params: { id: String(tokyoId) }, body: { accommodation_id: null }, user: customer }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.destination.accommodation_id, null);
  assert.equal(res.body.destination.accommodation, null);

  console.log('Destination accommodation controller checks passed (no database writes).');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
