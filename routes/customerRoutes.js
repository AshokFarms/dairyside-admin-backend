const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/customerController');
const v = require('../validators/customerValidators');

const router = express.Router();

router.get('/', validate(v.listQuery, 'query'), c.list);
router.get('/:id', validate(v.idParam, 'params'), c.getById);
router.get('/:id/orders', validate(v.idParam, 'params'), validate(v.listSubQuery, 'query'), c.getOrders);
router.get('/:id/subscriptions', validate(v.idParam, 'params'), c.getSubscriptions);
router.get('/:id/wallet', validate(v.idParam, 'params'), validate(v.listSubQuery, 'query'), c.getWallet);

// Manual wallet adjustment (credit/debit + ledger row, transactional).
// Enabled 2026-07-19 after the reference_type enum gained 'adjustment'.
router.post('/:id/wallet', validate(v.idParam, 'params'), validate(v.walletAdjust), c.adjustWallet);

module.exports = router;
