const asyncHandler = require('../middleware/asyncHandler');
const { ok } = require('../utils/apiResponse');
const { ApiError } = require('../middleware/errorHandler');
const auth = require('../services/adminAuth.service');
const config = require('../config/env');
const logger = require('../utils/logger');

// POST /v1/admin/auth/login   { idToken }
// The panel has already signed in with Firebase; it hands us the resulting ID
// token. We authorise it against the allowlist and swap it for an httpOnly
// session cookie — the token itself never gets stored in the browser.
const login = asyncHandler(async (req, res) => {
  const { idToken } = req.body || {};
  const admin = await auth.authorizeIdToken(idToken);
  const sessionCookie = await auth.createSessionCookie(idToken);

  res.cookie(auth.COOKIE_NAME, sessionCookie, auth.cookieOptions());
  logger.info('admin.login', { uid: admin.uid });
  return ok(res, admin);
});

// POST /v1/admin/auth/logout
// Clearing the cookie is what actually ends THIS session. Revoking refresh
// tokens additionally kills any other session for the same admin, which is the
// behaviour you want from a privileged panel ("sign out everywhere").
const logout = asyncHandler(async (req, res) => {
  const current = await auth.verifySession(req.cookies?.[auth.COOKIE_NAME]);
  // maxAge null → a delete rather than a 0-length cookie; attributes must match
  // the ones it was set with or the browser keeps the original.
  res.clearCookie(auth.COOKIE_NAME, auth.cookieOptions(null));
  if (current) {
    await auth.revokeSessions(current.uid);
    logger.info('admin.logout', { uid: current.uid });
  }
  return ok(res, { loggedOut: true });
});

// GET /v1/admin/auth/me
// The panel calls this on load to decide whether to render or redirect to
// /login. Deliberately NOT behind adminGuard: a 401 here is a normal answer
// ("you are signed out"), not an error condition.
const me = asyncHandler(async (req, res) => {
  // Open mode: adminGuard lets every /v1/admin request through, so gating the
  // PANEL would be theatre — and worse, it would make the panel unusable
  // (nothing can sign in while ADMIN_UIDS is empty) even though the API behind
  // it is wide open. Report the same posture the guard actually enforces.
  if (!config.auth.enabled) {
    return ok(res, { uid: 'admin:open', email: null, name: null, mode: 'open' });
  }

  const admin = await auth.verifySession(req.cookies?.[auth.COOKIE_NAME]);
  if (!admin) throw new ApiError(401, 'Not signed in');
  return ok(res, { ...admin, mode: 'enforced' });
});

module.exports = { login, logout, me };
