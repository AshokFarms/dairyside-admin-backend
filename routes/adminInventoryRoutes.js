// Mounted at /v1/admin/inventory. All stock mutations here go through
// services/inventoryService.js — the single ledgered write path — never the raw
// product_variants table.
const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/inventoryController');
const v = require('../validators/inventoryValidators');

const router = express.Router();

// Reads
router.get('/variants', validate(v.listQuery, 'query'), c.variants);
router.get('/low-stock', validate(v.listQuery, 'query'), c.lowStock);
router.get('/ledger', validate(v.listQuery, 'query'), c.ledger);

// Writes (ledgered + broadcast)
router.post('/variants/:id/restock', validate(v.idParam, 'params'), validate(v.restock), c.restock);
router.post('/variants/:id/adjust', validate(v.idParam, 'params'), validate(v.adjust), c.adjust);
router.patch('/variants/:id/threshold', validate(v.idParam, 'params'), validate(v.threshold), c.setThreshold);

module.exports = router;
