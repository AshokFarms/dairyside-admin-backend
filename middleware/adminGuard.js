// Admin authorization seam.
//
// Admin login is intentionally NOT built yet (product decision). This middleware
// is mounted on every /v1/admin route so enforcement is a single config flip
// later — no route changes needed.
//
//   ADMIN_AUTH_ENABLED=false (default)  -> pass through, but tag the request.
//   ADMIN_AUTH_ENABLED=true             -> require an authenticated admin.
//
// When enabling, implement the real identity check where marked below (e.g.
// verify the Firebase session cookie shared with the customer app, then check
// the uid against config.auth.adminUids). Until then it must stay closed-by-flag,
// never silently authorize.
const config = require('../config/env');
const { ApiError } = require('./errorHandler');

function adminGuard(req, res, next) {
  if (!config.auth.enabled) {
    req.admin = { authenticated: false, mode: 'open' };
    return next();
  }

  // ── Real enforcement path (active only when ADMIN_AUTH_ENABLED=true) ──
  // TODO(auth): resolve the caller's identity from the session cookie / token.
  const uid = req.admin?.uid; // populated by a future auth middleware
  if (!uid) {
    return next(new ApiError(401, 'Authentication required'));
  }
  if (config.auth.adminUids.length > 0 && !config.auth.adminUids.includes(uid)) {
    return next(new ApiError(403, 'Admin access required'));
  }
  req.admin = { authenticated: true, uid, mode: 'enforced' };
  return next();
}

module.exports = adminGuard;
