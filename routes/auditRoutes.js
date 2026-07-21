// Mounted at /v1/admin/audit-logs.
//
// Entries are written exclusively by the customer backend and can never be
// edited — there is no POST/PUT/PATCH here, and the DB trigger rejects UPDATE
// outright. DELETE is permitted as an explicit admin action and is itself
// recorded as an AUDIT_DELETE entry.
const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/auditController');
const v = require('../validators/auditValidators');

const router = express.Router();

router.get('/', validate(v.listQuery, 'query'), c.list);
router.get('/facets', c.facets);
router.get('/entity/:type/:id', validate(v.entityParams, 'params'), validate(v.entityQuery, 'query'), c.entityHistory);

// How many rows would this delete? Powers the confirmation dialog.
router.post('/delete-preview', validate(v.deleteBody, 'body'), c.previewDelete);

// Bulk: { ids: [...] } or { olderThanDays: n } — exactly one, never neither.
router.delete('/', validate(v.deleteBody, 'body'), c.removeMany);
router.delete('/:id', validate(v.idParam, 'params'), c.removeOne);

module.exports = router;
