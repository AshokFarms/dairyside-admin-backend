const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/subscriptionController');
const v = require('../validators/subscriptionValidators');

const router = express.Router();

// GET /v1/admin/trial-packs — free_trial_claims list (trial pack = a product
// flagged is_trial_available; claims live in free_trial_claims).
router.get('/', validate(v.trialListQuery, 'query'), c.getTrialPacks);

module.exports = router;
