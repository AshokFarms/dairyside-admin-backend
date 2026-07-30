// Admin authorization.
//
//   ADMIN_AUTH_ENABLED=false (default)  -> pass through, but tag the request.
//   ADMIN_AUTH_ENABLED=true             -> require a valid admin session cookie
//                                          whose uid is in ADMIN_UIDS.
//
// Identity comes from a Firebase session cookie minted by /v1/admin/auth/login
// (see services/adminAuth.service.js). The allowlist is re-checked here on every
// request, so removing a uid from ADMIN_UIDS takes effect immediately rather
// than whenever that admin's cookie happens to expire.
//
// NOTE on the open mode: it is still the default so existing deployments don't
// break on upgrade, but it is not a safe posture for an internet-facing API.
// Set ADMIN_AUTH_ENABLED=true and ADMIN_UIDS=<your uid> to close it.
const config = require('../config/env');
const { ApiError } = require('./errorHandler');
const auth = require('../services/adminAuth.service');

async function adminGuard(req, res, next) {
  if (!config.auth.enabled) {
    req.admin = { authenticated: false, mode: 'open' };
    return next();
  }

  // Refuse to run "enforced" with an empty allowlist. isAllowedAdmin() already
  // fails closed, so this would deny every request anyway — saying so plainly
  // beats an operator debugging a panel that rejects a correct password.
  if (config.auth.adminUids.length === 0) {
    return next(
      new ApiError(500, 'Admin auth is enabled but ADMIN_UIDS is empty — nobody can sign in')
    );
  }

  const admin = await auth.verifySession(req.cookies?.[auth.COOKIE_NAME]);
  if (!admin) {
    return next(new ApiError(401, 'Authentication required'));
  }

  req.admin = { authenticated: true, uid: admin.uid, email: admin.email, mode: 'enforced' };
  return next();
}

// Wrapped so a rejected promise reaches the error handler rather than becoming
// an unhandled rejection — this runs on every admin route.
module.exports = (req, res, next) => adminGuard(req, res, next).catch(next);
