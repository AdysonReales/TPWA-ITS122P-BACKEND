// Supabase-backed integration verification. Every data change is rolled back.
// The bcrypt comparison is stubbed because this checks login/session wiring,
// not credential hashing; no password is read or printed.
require('dotenv').config();
const assert = require('node:assert/strict');
const Module = require('node:module');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

function response() {
  return {
    statusCode: 200,
    body: null,
    cookies: {},
    clearedCookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value) { this.cookies[name] = value; return this; },
    clearCookie(name) { this.clearedCookies.push(name); return this; },
  };
}

function request({ body = {}, params = {}, query = {}, user = null, ip = '203.0.113.42' } = {}) {
  return {
    body,
    params,
    query,
    user,
    ip,
    originalUrl: '/integration-test',
    get(name) { return name.toLowerCase() === 'user-agent' ? 'LakBye session activity integration test' : undefined; },
  };
}

async function run() {
  const client = await db.connect();
  const originalQuery = db.query;
  const originalLoad = Module._load;
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    db.query = (...args) => client.query(...args);
    Module._load = function patchedLoad(requestName, parent, isMain) {
      if (requestName === '../config/db') return db;
      if (requestName === '../utils/logger') return { logAction: async () => {} };
      if (requestName === 'bcrypt' && parent?.filename.endsWith('auth.controller.js')) {
        return { compare: async () => true };
      }
      return originalLoad.call(this, requestName, parent, isMain);
    };

    const auth = require('../controllers/auth.controller');
    const trips = require('../controllers/trips.controller');
    const destinations = require('../controllers/destinations.controller');
    const bookings = require('../controllers/bookings.controller');
    const sessions = require('../controllers/sessions.controller');
    const activity = require('../controllers/activity.controller');

    const customerResult = await client.query(
      "SELECT id, email FROM users WHERE role = 'customer' AND is_active = TRUE AND COALESCE(is_verified, TRUE) = TRUE ORDER BY id LIMIT 1"
    );
    const staffResult = await client.query(
      "SELECT id FROM users WHERE role IN ('staff', 'admin') AND is_active = TRUE ORDER BY id LIMIT 1"
    );
    const propertyResult = await client.query(
      "SELECT id, country, area FROM accommodations WHERE is_active = TRUE AND price IS NOT NULL AND country = 'Japan' AND area = 'Tokyo' ORDER BY id LIMIT 1"
    );
    assert.ok(customerResult.rows[0], 'A verified customer is required for this verification.');
    assert.ok(staffResult.rows[0], 'A staff/admin account is required for this verification.');
    assert.ok(propertyResult.rows[0], 'A bookable Tokyo accommodation is required for this verification.');

    const loginRes = response();
    await auth.login(request({
      body: {
        email: customerResult.rows[0].email,
        password: 'not-used-by-test',
        ip_address: '198.51.100.99',
      },
    }), loginRes);
    assert.equal(loginRes.statusCode, 200, 'login succeeds');
    assert.ok(loginRes.body.session_id, 'login returns its server-created session ID');
    assert.ok(loginRes.body.token, 'the existing login token response remains available');
    const customer = jwt.verify(loginRes.body.token, process.env.JWT_SECRET);
    assert.equal(Number(customer.session_id), Number(loginRes.body.session_id), 'session ID is carried by the existing token');

    const tripRes = response();
    await trips.createTrip(request({
      user: customer,
      body: { title: 'Session activity integration', start_date: '2090-07-01', end_date: '2090-07-03', total_budget: 1000 },
    }), tripRes);
    assert.equal(tripRes.statusCode, 201);
    const tripId = tripRes.body.trip.id;

    const tripUpdateRes = response();
    await trips.updateTrip(request({ user: customer, params: { id: String(tripId) }, body: { title: 'Session activity integration updated' } }), tripUpdateRes);
    assert.equal(tripUpdateRes.statusCode, 200);

    const destinationRes = response();
    await destinations.createDestination(request({
      user: customer,
      body: { trip_id: tripId, country: propertyResult.rows[0].country, location_name: propertyResult.rows[0].area, accommodation_id: propertyResult.rows[0].id },
    }), destinationRes);
    assert.equal(destinationRes.statusCode, 201);
    const destinationId = destinationRes.body.destination.id;

    const destinationUpdateRes = response();
    await destinations.updateDestination(request({
      user: customer,
      params: { id: String(destinationId) },
      body: { accommodation_id: propertyResult.rows[0].id },
    }), destinationUpdateRes);
    assert.equal(destinationUpdateRes.statusCode, 200);

    const createBooking = async () => {
      const res = response();
      await bookings.createBooking(request({
        user: customer,
        body: { trip_id: tripId, destination_id: destinationId, accommodation_id: propertyResult.rows[0].id },
      }), res);
      assert.equal(res.statusCode, 201);
      return res.body.booking;
    };
    const customerCancelled = await createBooking();
    const staffConfirmed = await createBooking();
    const staffCancelled = await createBooking();

    const cancelRes = response();
    await bookings.cancelBooking(request({ user: customer, params: { id: String(customerCancelled.id) } }), cancelRes);
    assert.equal(cancelRes.statusCode, 200, 'customer can cancel a pending booking');

    const staffLoginSession = await require('../utils/userSessions').startUserSession(
      request(), staffResult.rows[0].id
    );
    const staff = { id: staffResult.rows[0].id, role: 'staff', session_id: staffLoginSession.id };

    const confirmRes = response();
    await bookings.updateBookingStatus(request({ user: staff, params: { id: String(staffConfirmed.id) }, body: { status: 'confirmed' } }), confirmRes);
    assert.equal(confirmRes.statusCode, 200);
    const staffCancelRes = response();
    await bookings.updateBookingStatus(request({ user: staff, params: { id: String(staffCancelled.id) }, body: { status: 'cancelled' } }), staffCancelRes);
    assert.equal(staffCancelRes.statusCode, 200);

    const deleteRes = response();
    await trips.deleteTrip(request({ user: customer, params: { id: String(tripId) } }), deleteRes);
    assert.equal(deleteRes.statusCode, 200);

    const admin = { id: staff.id, role: 'admin' };
    const sessionsRes = response();
    await sessions.getSessions(request({ user: admin, query: { user_id: String(customer.id) } }), sessionsRes);
    assert.equal(sessionsRes.statusCode, 200);
    const customerSession = sessionsRes.body.sessions.find((item) => Number(item.session_id) === Number(customer.session_id));
    assert.ok(customerSession, 'admin session list includes the login session');
    assert.equal(customerSession.ip_address.split('/')[0], '203.0.113.42', 'IP is captured from the server request context');
    assert.equal(customerSession.user_agent, 'LakBye session activity integration test');
    assert.ok(customerSession.session_start);
    assert.equal(customerSession.session_end, null, 'open sessions do not receive an invented end time');
    assert.equal(customerSession.action_count, 11, 'admin session list includes business action count');
    assert.equal(Object.keys(customerSession).some((key) => /token|password/i.test(key)), false, 'admin session response excludes secrets');

    const actionsRes = response();
    await sessions.getSessionActions(request({ user: admin, params: { id: String(customer.session_id) } }), actionsRes);
    assert.equal(actionsRes.statusCode, 200);
    const customerActions = actionsRes.body.actions.map((item) => item.action);
    for (const expected of ['CREATE_TRIP', 'UPDATE_TRIP', 'ADD_DESTINATION', 'SELECT_ACCOMMODATION', 'UPDATE_DESTINATION', 'CREATE_BOOKING', 'CANCEL_BOOKING', 'DELETE_TRIP']) {
      assert.ok(customerActions.includes(expected), `session actions include ${expected}`);
    }

    const filteredActivityRes = response();
    await activity.getActivity(request({ user: admin, query: { session_id: String(staff.session_id) } }), filteredActivityRes);
    assert.equal(filteredActivityRes.statusCode, 200);
    const staffActions = filteredActivityRes.body.activities.map((item) => item.action);
    assert.ok(staffActions.includes('STAFF_CONFIRM_BOOKING'));
    assert.ok(staffActions.includes('STAFF_CANCEL_BOOKING'));

    const logoutRes = response();
    await auth.logout(request({ user: customer }), logoutRes);
    assert.equal(logoutRes.statusCode, 200);
    const staffLogoutRes = response();
    await auth.logout(request({ user: staff }), staffLogoutRes);
    assert.equal(staffLogoutRes.statusCode, 200);

    const finalized = await client.query(
      'SELECT COUNT(*)::int AS ended_count, MIN(duration_seconds)::int AS min_duration FROM user_sessions WHERE id = ANY($1::int[]) AND session_end IS NOT NULL AND duration_seconds IS NOT NULL',
      [[customer.session_id, staff.session_id]]
    );
    assert.equal(finalized.rows[0].ended_count, 2, 'logout sets session end and duration for both sessions');
    assert.ok(finalized.rows[0].min_duration >= 0);

    await client.query('ROLLBACK');
    transactionOpen = false;
    console.log('Session and activity logging verification passed; all database changes rolled back.');
  } finally {
    Module._load = originalLoad;
    db.query = originalQuery;
    if (transactionOpen) await client.query('ROLLBACK');
    client.release();
    await db.end();
  }
}

run().catch((error) => {
  console.error('Session and activity logging verification failed:', error.stack || error.message);
  process.exitCode = 1;
});
