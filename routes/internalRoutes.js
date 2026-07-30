// Mounted at /v1/admin/internal, OUTSIDE the adminGuard tree — the caller is
// the customer backend process authenticating with a shared secret, not an
// admin with a session cookie.
const express = require('express');
const internalSecret = require('../middleware/internalSecret');
const c = require('../controllers/internalEventsController');

const router = express.Router();

router.post('/events', internalSecret, c.events);

module.exports = router;
