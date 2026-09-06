/**
 * Role-Based Access Control middleware.
 * Usage: router.get('/admin-only', authenticateToken, authorizeRoles('admin'), handler)
 *
 * Must run AFTER authenticateToken, since it relies on req.user.role
 * having already been set from the verified JWT.
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. No authenticated user.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Requires one of these roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

module.exports = { authorizeRoles };
