const MAX_PAGE_LENGTH = 500;

function isForbiddenBodyKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['userid', 'ip', 'ipaddress', 'useragent', 'headers'].includes(normalized)
    || normalized.includes('password')
    || normalized.includes('token')
    || normalized.includes('otp')
    || normalized.includes('cookie')
    || normalized.includes('authorization');
}

function containsForbiddenBodyFields(body) {
  return body && typeof body === 'object'
    ? Object.keys(body).some(isForbiddenBodyKey)
    : false;
}

function parsePositiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validatePage(page) {
  if (page === undefined || page === null || page === '') return null;
  if (typeof page !== 'string') {
    throw new TypeError('page must be a valid application path.');
  }

  const value = page.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    throw new TypeError('page must be a relative application path.');
  }

  let pathname;
  try {
    pathname = new URL(value, 'http://lakbye.local').pathname;
  } catch (error) {
    throw new TypeError('page must be a valid application path.');
  }

  if (!pathname || pathname.length > MAX_PAGE_LENGTH) {
    throw new TypeError(`page pathname must not exceed ${MAX_PAGE_LENGTH} characters.`);
  }
  return pathname;
}

module.exports = {
  validatePage,
  parsePositiveInteger,
  containsForbiddenBodyFields,
  MAX_PAGE_LENGTH,
};
