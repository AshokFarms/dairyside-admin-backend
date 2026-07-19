const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/deliveryController');
const v = require('../validators/deliveryValidators');

const router = express.Router();

router.get('/today', validate(v.todayQuery, 'query'), c.getToday);
router.post('/bulk-complete', validate(v.bulkComplete), c.bulkComplete);
router.patch('/:orderId/complete', validate(v.idParam, 'params'), c.complete);

module.exports = router;
