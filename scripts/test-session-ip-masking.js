const assert = require('node:assert/strict');
const { maskIpAddress } = require('../utils/maskIpAddress');
const pool = require('../config/db');
const { getSessions, getSessionActions } = require('../controllers/sessions.controller');

assert.equal(maskIpAddress('192.168.1.42'), '192.168.1.xxx');
assert.equal(maskIpAddress('10.30.126.74/32'), '10.30.126.xxx');
assert.equal(maskIpAddress('10.26.34.133/32'), '10.26.34.xxx');
assert.equal(maskIpAddress('2001:db8:85a3:0000:0000:8a2e:0370:7334'), '2001:db8:85a3:xxxx:xxxx:xxxx:xxxx:xxxx');
assert.equal(maskIpAddress('2001:db8:85a3::8a2e:370:7334/128'), '2001:db8:85a3:xxxx:xxxx:xxxx:xxxx:xxxx');
assert.equal(maskIpAddress('2001:db8::1'), '2001:db8:0:xxxx:xxxx:xxxx:xxxx:xxxx');
assert.equal(maskIpAddress('::ffff:192.0.2.128'), '0:0:0:xxxx:xxxx:xxxx:xxxx:xxxx');
assert.equal(maskIpAddress(null), null);
assert.equal(maskIpAddress('not-an-ip'), 'Masked');

async function verifyAdminSessionResponse() {
  const originalQuery = pool.query;
  pool.query = async (query) => {
    if (query.includes('UPDATE user_sessions')) return { rows: [] };
    if (query.includes('COUNT(*)::int AS total FROM user_sessions')) {
      return { rows: [{ total: 1 }] };
    }
    if (query.includes('FROM user_sessions s')) {
      return {
        rows: [
          { session_id: 7, ip_address: '10.30.126.74/32', duration_seconds: 90, action_count: 2, session_end: null },
          { session_id: 8, ip_address: '10.26.34.133/32', duration_seconds: 120, action_count: 1, session_end: '2026-10-06T03:00:00.000Z' },
        ],
      };
    }
    if (query.includes('SELECT id AS session_id, ip_address::text AS ip_address')) {
      return { rows: [{ session_id: 7, ip_address: '10.30.126.74/32' }] };
    }
    if (query.includes('COUNT(*)::int AS total FROM activity_logs')) return { rows: [{ total: 0 }] };
    if (query.includes('FROM activity_logs')) return { rows: [] };
    throw new Error('Unexpected session query in test.');
  };

  try {
    const response = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await getSessions({ query: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.sessions[0].ip_address, '10.30.126.xxx');
    assert.equal(response.body.sessions[0].duration_seconds, 90);
    assert.equal(response.body.sessions[0].action_count, 2);
    assert.equal(response.body.sessions[1].ip_address, '10.26.34.xxx');
    assert.ok(!JSON.stringify(response.body).includes('10.30.126.74'));
    assert.ok(!JSON.stringify(response.body).includes('10.26.34.133'));

    const detailResponse = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await getSessionActions({ params: { id: '7' }, query: {} }, detailResponse);
    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detailResponse.body.session.ip_address, '10.30.126.xxx');
    assert.ok(!JSON.stringify(detailResponse.body).includes('10.30.126.74'));
  } finally {
    pool.query = originalQuery;
    await pool.end();
  }
}

verifyAdminSessionResponse()
  .then(() => console.log('Session IP masking checks passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
