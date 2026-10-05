const net = require('net');

const MAX_USER_AGENT_LENGTH = 1000;

function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || !net.isIP(candidate)) return null;
  return candidate;
}

function getRequestContext(req) {
  const authenticatedId = Number(req.user?.id);
  const userAgent = req.get('user-agent');

  return {
    userId: Number.isInteger(authenticatedId) && authenticatedId > 0 ? authenticatedId : null,
    // Express derives req.ip from the socket and the configured trust proxy policy.
    // Never read X-Forwarded-For directly here.
    ipAddress: normalizeIp(req.ip),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    requestPath: String(req.originalUrl || req.path || '').split('?')[0].slice(0, 500) || null,
  };
}

module.exports = { getRequestContext, normalizeIp, MAX_USER_AGENT_LENGTH };
