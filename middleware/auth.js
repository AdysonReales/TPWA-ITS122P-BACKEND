const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT and attaches the decoded payload to req.user.
 * Accepts the token either from an httpOnly cookie ("token") or from
 * an "Authorization: Bearer <token>" header, so it works whether the
 * frontend uses cookies or a bearer-token flow.
 */
function authenticateToken(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  const token = req.cookies?.token || bearer;

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

// Populates req.user only when a valid token is present. This is useful for
// endpoints such as logout that should remain idempotent for expired sessions.
function optionalAuthenticateToken(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = req.cookies?.token || bearer;
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_error) {
    // Optional authentication deliberately treats invalid/expired tokens as anonymous.
  }
  return next();
}

module.exports = { authenticateToken, optionalAuthenticateToken };
