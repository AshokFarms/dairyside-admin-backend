// ============================================================
//  routes/adminAuthRoutes.js
//  Mounted at /v1/admin/auth, OUTSIDE the adminGuard tree — login has to be
//  reachable by someone who is not yet authenticated, and /me must be able to
//  answer "no" without that counting as an error.
// ============================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/adminAuthController');

const router = express.Router();

// Tighter than the general admin limiter: this is the one endpoint an attacker
// can reach without credentials, so it gets its own budget. Keyed on IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // A rejected sign-in still costs a Firebase verification, so count failures
  // as well as successes.
  message: { success: false, error: 'Too many sign-in attempts, try again later' },
});

router.post('/login', loginLimiter, c.login);
router.post('/logout', c.logout);
router.get('/me', c.me);

module.exports = router;
