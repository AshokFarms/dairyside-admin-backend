const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/pincodeController');
const v = require('../validators/pincodeValidators');

const router = express.Router();

router.get('/', validate(v.listQuery, 'query'), c.list);
router.post('/', validate(v.createBody), c.create);
router.put('/:id', validate(v.idParam, 'params'), validate(v.updateBody), c.update);
router.delete('/:id', validate(v.idParam, 'params'), c.remove);

module.exports = router;
