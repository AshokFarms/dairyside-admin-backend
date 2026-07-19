const asyncHandler = require('../middleware/asyncHandler');
const { ok, created, paginated } = require('../utils/apiResponse');
const pincodeService = require('../services/pincodeService');

const list = asyncHandler(async (req, res) => {
  paginated(res, await pincodeService.list(req.query));
});

const create = asyncHandler(async (req, res) => {
  created(res, await pincodeService.create(req.body));
});

const update = asyncHandler(async (req, res) => {
  ok(res, await pincodeService.update(req.params.id, req.body));
});

const remove = asyncHandler(async (req, res) => {
  ok(res, await pincodeService.remove(req.params.id));
});

module.exports = { list, create, update, remove };
