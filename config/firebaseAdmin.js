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
 *   3. GOOGLE_APPLICATION_CREDENTIALS — path to a key file (local dev only;
 *      a path is meaningless on a host that has no such file)
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

/** Distinguishes "you configured nothing" from "what you configured is broken". */
class CredentialError extends Error {
  constructor(message, { configured }) {
    super(message);
    this.name = 'CredentialError';
    this.configured = configured;
  }
}

/**
 * Env vars cannot hold real newlines, so a PEM key pasted into one arrives with
 * literal backslash-n. Left alone, credential.cert() fails with an opaque
 * "Failed to parse private key" — the single most common way a working key
 * looks broken on Render/Heroku.
 */
function normalizePrivateKey(sa) {
  if (sa && typeof sa.private_key === 'string' && sa.private_key.includes('\\n')) {
    return { ...sa, private_key: sa.private_key.replace(/\\n/g, '\n') };
  }
  return sa;
}

function resolveCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    let parsed;
    try {
      parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      throw new CredentialError(
        `FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON (${err.message}). ` +
          'Paste the ENTIRE key file as a single line, quotes and all.',
        { configured: true }
      );
    }
    return admin.credential.cert(normalizePrivateKey(parsed));
  }

  if (
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PROJECT_ID
  ) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return admin.credential.cert(normalizePrivateKey(require(path)));
    } catch (err) {
      throw new CredentialError(
        `GOOGLE_APPLICATION_CREDENTIALS points at "${path}" but it could not be read (${err.message}). ` +
          'On a hosted deployment use FIREBASE_SERVICE_ACCOUNT_JSON instead — a file path from your laptop does not exist there.',
        { configured: true }
      );
    }
  }

  throw new CredentialError(
    'No Firebase credential is configured. Set FIREBASE_SERVICE_ACCOUNT_JSON to the entire ' +
      'service-account key file as a single line.',
    { configured: false }
  );
}

/** The initialised Admin SDK. Throws a CredentialError if unusable. */
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
    initError =
      err instanceof CredentialError
        ? err
        : new CredentialError(
            `Firebase rejected the configured credential (${err.message}).`,
            { configured: true }
          );
    logger.error('firebase.init_failed', { message: initError.message });
    throw initError;
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

/** Why it is unavailable, for startup diagnostics and the sign-in error. */
function unavailableReason() {
  try {
    getAdmin();
    return null;
  } catch (err) {
    return err.message;
  }
}

module.exports = { getAdmin, isAvailable, unavailableReason, CredentialError };
