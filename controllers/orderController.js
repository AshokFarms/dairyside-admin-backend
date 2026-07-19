const asyncHandler = require('../middleware/asyncHandler');
const { ok, paginated } = require('../utils/apiResponse');
const orderService = require('../services/orderService');

const list = asyncHandler(async (req, res) => {
  paginated(res, await orderService.list(req.query));
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await orderService.getById(req.params.id));
});

const updateStatus = asyncHandler(async (req, res) => {
  ok(res, await orderService.updateStatus(req.params.id, req.body.status));
});

const bulkUpdateStatus = asyncHandler(async (req, res) => {
  ok(res, await orderService.bulkUpdateStatus(req.body.ids, req.body.status));
});

module.exports = { list, getById, updateStatus, bulkUpdateStatus };
