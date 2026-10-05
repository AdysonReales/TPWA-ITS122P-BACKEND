const pool = require('../config/db');
const { getRequestContext } = require('./requestContext');

const MAX_METADATA_BYTES = 8 * 1024;
const MAX_METADATA_DEPTH = 5;
const MAX_METADATA_ARRAY_ITEMS = 50;
const MAX_METADATA_STRING_LENGTH = 1000;

const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'current_password', 'new_password',
  'token', 'access_token', 'refresh_token', 'reset_token', 'reset_password_token',
  'otp', 'verify_otp', 'cookie', 'cookies', 'authorization', 'authorization_header',
  'headers', 'request_body', 'raw_body',
]);

// Telemetry is intentionally limited to small, useful application facts.
// Unknown keys are discarded so raw request/context objects cannot be stored.
const ALLOWED_METADATA_KEYS = new Set([
  'tripid', 'destinationid', 'bookingid', 'category', 'actionsource',
  'status', 'routename', 'itemid', 'expenseid', 'feedbackid',
]);

const SECRET_VALUE_PATTERNS = [
  [/\bAuthorization\s*:\s*[^\r\n,;]+/gi, 'Authorization: [REDACTED]'],
  [/\bBearer\s+(?!\[REDACTED\])[^\s,;"'<>]+/gi, 'Bearer [REDACTED]'],
  [/(\b(?:access[_-]?token|refresh[_-]?token|reset[_-]?token|token|otp|password)\b\s*["']?\s*[:=]\s*["']?)[^\s&,"'<>}]*/gi, '$1[REDACTED]'],
  [/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]'],
];

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[-\s]/g, '_');
}

function isSensitiveKey(key) {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEYS.has(normalized)
    || normalized.includes('password')
    || normalized.includes('token')
    || normalized.includes('otp')
    || normalized.includes('cookie')
    || normalized.includes('authorization')
    || normalized === 'headers'
    || normalized === 'request_body'
    || normalized === 'raw_body';
}

function sanitizeString(value) {
  let sanitized = value;
  for (const [pattern, replacement] of SECRET_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized.slice(0, MAX_METADATA_STRING_LENGTH);
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > MAX_METADATA_DEPTH) return '[depth-limited]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_ITEMS)
      .map((item) => sanitizeMetadataValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveKey(key)
          && ALLOWED_METADATA_KEYS.has(normalizeKey(key).replace(/_/g, '')))
        .map(([key, item]) => [key.slice(0, 100), sanitizeMetadataValue(item, depth + 1)])
    );
  }
  return String(value).slice(0, MAX_METADATA_STRING_LENGTH);
}

function validateAndSanitizeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('metadata must be a JSON object.');
  }

  const serialized = JSON.stringify(metadata);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) {
    throw new RangeError(`metadata must not exceed ${MAX_METADATA_BYTES} bytes.`);
  }

  const sanitized = sanitizeMetadataValue(metadata);
  if (Buffer.byteLength(JSON.stringify(sanitized), 'utf8') > MAX_METADATA_BYTES) {
    throw new RangeError(`sanitized metadata must not exceed ${MAX_METADATA_BYTES} bytes.`);
  }
  return sanitized;
}

async function insertActivity({ req, userId, sessionId = null, eventType, page = null, metadata = {} }) {
  const context = getRequestContext(req);
  const effectiveUserId = userId || context.userId;
  const safeMetadata = validateAndSanitizeMetadata(metadata);

  const result = await pool.query(
    `INSERT INTO activity_logs (
       user_id, session_id, event_type, page, ip_address, user_agent, metadata
     ) VALUES ($1, $2, $3, $4, $5::inet, $6, $7::jsonb)
     RETURNING id, user_id, session_id, event_type, page, ip_address::text,
               user_agent, metadata, created_at`,
    [
      effectiveUserId,
      sessionId,
      eventType,
      page || context.requestPath,
      context.ipAddress,
      context.userAgent,
      JSON.stringify(safeMetadata),
    ]
  );
  return result.rows[0];
}

async function recordActivitySafely(details) {
  try {
    await insertActivity(details);
    return true;
  } catch (error) {
    console.warn(`Activity telemetry was not recorded (${details.eventType}):`, error.message);
    return false;
  }
}

module.exports = {
  insertActivity,
  recordActivitySafely,
  validateAndSanitizeMetadata,
  MAX_METADATA_BYTES,
};
