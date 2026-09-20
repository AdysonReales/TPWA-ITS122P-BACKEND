/**
 * Role-Based Access Control middleware.
 * Usage: router.get('/admin-only', authenticateToken, authorizeRoles('admin'), handler)
 *
 * Must run AFTER authenticateToken, since it relies on req.user.role
 * having already been set from the verified JWT.
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    // 1. Check if user and role exist in the token payload
    if (!req.user || !req.user.role) {
      return res.status(403).json({ message: 'Access denied. Role missing from token.' });
    }

    // 2. Normalize roles to lowercase to prevent 'ADMIN' vs 'admin' 403 errors
    const userRole = String(req.user.role).trim().toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => String(r).trim().toLowerCase());

    // 3. Check if the user's role is in the allowed list
    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: `Access denied. Requires one of these roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

module.exports = { authorizeRoles };