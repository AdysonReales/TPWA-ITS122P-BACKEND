const assert = require('node:assert/strict');
const { validateBookingDate } = require('../utils/bookingDateRange');

const start = '2026-10-10';
const end = '2026-10-17';
assert.equal(validateBookingDate('2026-10-09', start, end)?.status, 422, 'day before trip is rejected');
assert.equal(validateBookingDate(start, start, end), null, 'trip start is inclusive');
assert.equal(validateBookingDate('2026-10-13', start, end), null, 'middle date is allowed');
assert.equal(validateBookingDate(end, start, end), null, 'trip end is inclusive');
assert.equal(validateBookingDate('2026-10-18', start, end)?.status, 422, 'day after trip is rejected');
assert.equal(validateBookingDate('2026-02-30', start, end)?.status, 400, 'invalid calendar date is rejected');
assert.equal(validateBookingDate(undefined, start, end), null, 'omitted optional booking date remains allowed');
console.log('Booking date range validation passed.');
