/**
 * Firebase Admin SDK — admin API.
 * ------------------------------------------------------------------
 * The admin panel authenticates against the SAME Firebase project as the
 * customer app, so an admin is just a Firebase user whose uid appears in
 * ADMIN_UIDS. This module only needs to VERIFY tokens and MINT session cookies;
 * it never creates users (admins are provisioned in the Firebase console).
 *
 * Credentials, in priority order:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  — the whole JSON as one env var (Render)
 *   2. FIREBASE_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY  — split env vars
 *   3. GOOGLE_APPLICATION_CREDENTIALS — path to a key file (local dev)
 *
 * For local dev you do NOT need a second copy of the key. Point at the one the
 * customer backend already uses:
 *   GOOGLE_APPLICATION_CREDENTIALS=d:/DairySide/MernApp1-Grocery-backend/config/serviceAccountKey.json
 *
 * Loading is LAZY: the admin API must still boot (and serve /health) when auth
 * is disabled and no credentials are present. Initialisation therefore happens
 * on first use, and only throws for the request that actually needed it.
 */

const admin = require('firebase-admin');
const logger = require('../utils/logger');

let initialised = false;
let initError = null;

function resolveCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }
  if (
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PROJECT_ID
  ) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Env vars flatten newlines; restore them or the key is rejected.
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return admin.credential.cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }
  throw new Error(
    'No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, or the split ' +
      'FIREBASE_* vars, or GOOGLE_APPLICATION_CREDENTIALS to a key file path.'
  );
}

/** The initialised Admin SDK. Throws if credentials are missing/invalid. */
function getAdmin() {
  if (initialised) {
    if (initError) throw initError;
    return admin;
  }
  initialised = true;
  try {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: resolveCredential() });
      logger.info('firebase.initialised');
    }
    return admin;
  } catch (err) {
    initError = err;
    logger.error('firebase.init_failed', { message: err.message });
    throw err;
  }
}

/** True when credentials are present and usable — for startup diagnostics. */
function isAvailable() {
  try {
    getAdmin();
    return true;
  } catch {
    return false;
  }
}

module.exports = { getAdmin, isAvailable };
