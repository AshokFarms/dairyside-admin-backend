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

// POST /:id/wallet (manual adjustment) is implemented (customerService.adjustWallet)
// but NOT mounted yet: it writes wallet_transactions.reference_type = 'adjustment',
// which requires extending that enum first (see DDL handoff). Enable this line
// once the ALTER has run:
// router.post('/:id/wallet', validate(v.idParam, 'params'), validate(v.walletAdjust), c.adjustWallet);

module.exports = router;
