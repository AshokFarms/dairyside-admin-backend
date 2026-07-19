const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/subscriptionController');
const v = require('../validators/subscriptionValidators');

const router = express.Router();

router.get('/', validate(v.listQuery, 'query'), c.list);
router.get('/:id', validate(v.idParam, 'params'), c.getById);
router.patch('/:id/status', validate(v.idParam, 'params'), validate(v.statusUpdate), c.updateStatus);

module.exports = router;
