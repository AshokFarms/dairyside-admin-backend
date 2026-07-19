const express = require('express');
const validate = require('../middleware/validate');
const { list, getById, updateStatus, bulkUpdateStatus } = require('../controllers/orderController');
const v = require('../validators/orderValidators');

const router = express.Router();

router.get('/', validate(v.listQuery, 'query'), list);
router.post('/bulk-status', validate(v.bulkStatus), bulkUpdateStatus);
router.get('/:id', validate(v.idParam, 'params'), getById);
router.patch('/:id/status', validate(v.idParam, 'params'), validate(v.statusUpdate), updateStatus);

// NOTE: PATCH /:id/notes intentionally NOT mounted yet — orders has no notes
// column. Enable after the `orders.admin_notes` ALTER in the DDL handoff.

module.exports = router;
