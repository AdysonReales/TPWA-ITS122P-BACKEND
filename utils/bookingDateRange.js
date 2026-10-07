function parseDateOnly(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function validateBookingDate(bookingDate, tripStartDate, tripEndDate) {
  if (bookingDate === undefined || bookingDate === null || bookingDate === '') return null;
  const requestedDate = parseDateOnly(bookingDate);
  const startDate = parseDateOnly(tripStartDate);
  const endDate = parseDateOnly(tripEndDate);
  if (!requestedDate || !startDate || !endDate || startDate > endDate) {
    return { status: 400, code: 'INVALID_BOOKING_DATE', message: 'booking_date and trip dates must be valid calendar dates.' };
  }
  if (requestedDate < startDate || requestedDate > endDate) {
    return { status: 422, code: 'BOOKING_DATE_OUTSIDE_TRIP', message: 'Booking date must be within the selected trip dates, inclusive.' };
  }
  return null;
}

module.exports = { parseDateOnly, validateBookingDate };
