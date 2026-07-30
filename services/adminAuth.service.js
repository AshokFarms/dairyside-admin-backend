// ============================================================
//  services/adminAuth.service.js
//  Admin identity, built on the SAME Firebase project as the customer app.
//
//  Flow:
//    1. The panel signs in with Firebase (client SDK) and gets an ID token.
//    2. It POSTs that token here. We verify it, check the uid against the
//       ADMIN_UIDS allowlist, and mint a Firebase SESSION COOKIE.
//    3. Every later request carries that cookie; adminGuard verifies it.
//
//  Why the admin API mints its OWN cookie rather than reusing the customer
//  app's: the customer session cookie is host-only for the customer API's
//  domain, so a browser would never send it here. Minting locally also keeps
//  the two sessions independent — signing into the admin panel does NOT consume
//  the customer app's single-session slot for that account.
// ============================================================

const { getAdmin } = require('../config/firebaseAdmin');
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'ds_admin_session';
// Firebase caps session cookies at 14 days. Admin sessions are shorter on
// purpose — this is a privileged surface, not a shopping session.
const SESSION_MS = Number(process.env.ADMIN_SESSION_MS) || 12 * 60 * 60 * 1000; // 12h

const isProduction = config.env === 'production';

/**
 * Cookie attributes.
 *
 * sameSite: the panel and this API are usually on DIFFERENT sites in production
 * (e.g. admin.dairyside.in vs *.onrender.com), and a cross-site XHR only carries
 * a cookie when it is SameSite=None; Secure. Locally both are on localhost
 * (same site, different ports) so 'lax' is correct and works over plain http.
 * Override with ADMIN_COOKIE_SAMESITE / ADMIN_COOKIE_DOMAIN if you move the
 * panel onto a subdomain of the API.
 *
 * CSRF: SameSite=None is safe here because this API only parses
 * application/json (no urlencoded/form parser is mounted), so a cross-site form
 * post cannot produce a valid body, and any JSON request is forced through a
 * CORS preflight that the origin allowlist rejects.
 */
function cookieOptions(maxAge = SESSION_MS) {
  const sameSite = process.env.ADMIN_COOKIE_SAMESITE || (isProduction ? 'none' : 'lax');
  const opts = {
    httpOnly: true,
    secure: isProduction || sameSite === 'none', // SameSite=None REQUIRES Secure
    sameSite,
    path: '/',
  };
  if (process.env.ADMIN_COOKIE_DOMAIN) opts.domain = process.env.ADMIN_COOKIE_DOMAIN;
  if (maxAge !== null) opts.maxAge = maxAge;
  return opts;
}

/**
 * Is this uid allowed to administer?
 *
 * FAILS CLOSED on an empty allowlist. This is deliberate and is the single most
 * important line in the file: an empty list must mean "nobody", never "anybody
 * with a Firebase account" — every customer of the storefront has one of those.
 */
function isAllowedAdmin(uid) {
  const allow = config.auth.adminUids;
  if (!Array.isArray(allow) || allow.length === 0) return false;
  return allow.includes(uid);
}

/**
 * Verify a freshly-issued Firebase ID token and authorise it as an admin.
 * @returns {{uid: string, email: string|null, name: string|null}}
 */
async function authorizeIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new ApiError(400, 'idToken required');
  }

  let decoded;
  try {
    decoded = await getAdmin().auth().verifyIdToken(idToken, true);
  } catch (err) {
    // Covers a missing-credentials init failure too — surfaced as "not signed
    // in" rather than a 500, since the caller can do nothing about either.
    throw new ApiError(401, 'Invalid or expired sign-in');
  }

  // Distinguish "nobody is configured" from "you specifically are not allowed".
  // Both deny, but only one is the operator's own misconfiguration, and telling
  // an admin their account is unauthorised when the real cause is an empty
  // ADMIN_UIDS sends them hunting in exactly the wrong place.
  // 403, not 5xx: errorHandler replaces the body of anything >= 500 with
  // "Internal Server Error", which would swallow the one piece of information
  // the operator actually needs. The message is safe to expose — it names an
  // env var and the caller's OWN uid, which they just proved they own.
  if (config.auth.adminUids.length === 0) {
    throw new ApiError(
      403,
      'Admin sign-in is not configured: ADMIN_UIDS is empty, so no account can be authorised. ' +
        `Set ADMIN_UIDS to the Firebase uid of whoever should administer (yours is ${decoded.uid}).`
    );
  }

  if (!isAllowedAdmin(decoded.uid)) {
    // Same message whether the uid is unknown or merely not an admin — do not
    // let this endpoint confirm which Firebase accounts exist.
    throw new ApiError(403, 'This account is not authorised for the admin panel');
  }

  return { uid: decoded.uid, email: decoded.email || null, name: decoded.name || null };
}

/** Mint a session cookie for an ALREADY-authorised ID token. */
async function createSessionCookie(idToken) {
  try {
    return await getAdmin().auth().createSessionCookie(idToken, { expiresIn: SESSION_MS });
  } catch (err) {
    // Firebase refuses tokens older than ~5 minutes here.
    throw new ApiError(401, 'Sign-in expired, please try again');
  }
}

/**
 * Verify a session cookie and re-check the allowlist.
 * The allowlist is re-checked on EVERY request, not just at login, so removing
 * a uid from ADMIN_UIDS revokes access on the next call rather than whenever
 * their cookie happens to expire.
 * @returns {{uid, email, name}|null} null when not a valid admin session
 */
async function verifySession(sessionCookie) {
  if (!sessionCookie) return null;
  try {
    const decoded = await getAdmin().auth().verifySessionCookie(sessionCookie, true);
    if (!isAllowedAdmin(decoded.uid)) return null;
    return { uid: decoded.uid, email: decoded.email || null, name: decoded.name || null };
  } catch {
    return null; // expired, revoked, tampered, or credentials unavailable
  }
}

/** Invalidate every session for this uid (logout everywhere). */
async function revokeSessions(uid) {
  try {
    await getAdmin().auth().revokeRefreshTokens(uid);
  } catch {
    /* best-effort: the cookie is cleared regardless */
  }
}

module.exports = {
  COOKIE_NAME,
  SESSION_MS,
  cookieOptions,
  isAllowedAdmin,
  authorizeIdToken,
  createSessionCookie,
  verifySession,
  revokeSessions,
};
