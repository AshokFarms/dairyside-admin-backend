const asyncHandler = require('../middleware/asyncHandler');
const { ok, paginated } = require('../utils/apiResponse');
const auditService = require('../services/auditService');

// Entries are created only by the customer backend and can never be edited —
// there is deliberately no create or update handler here. Deletion is allowed
// as an explicit admin action and is itself audited.
const list = asyncHandler(async (req, res) => {
  paginated(res, await auditService.list(req.query));
});

const entityHistory = asyncHandler(async (req, res) => {
  paginated(res, await auditService.entityHistory(req.params.type, req.params.id, req.query));
});

const facets = asyncHandler(async (req, res) => {
  ok(res, await auditService.facets());
});

const removeOne = asyncHandler(async (req, res) => {
  ok(res, await auditService.remove({ ids: [Number(req.params.id)] }, req));
});

const removeMany = asyncHandler(async (req, res) => {
  ok(res, await auditService.remove(req.body, req));
});

const previewDelete = asyncHandler(async (req, res) => {
  ok(res, await auditService.previewDelete(req.body));
});

module.exports = { list, entityHistory, facets, removeOne, removeMany, previewDelete };
