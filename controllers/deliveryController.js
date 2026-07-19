const asyncHandler = require('../middleware/asyncHandler');
const { ok } = require('../utils/apiResponse');
const deliveryService = require('../services/deliveryService');

const getToday = asyncHandler(async (req, res) => {
  ok(res, await deliveryService.getToday(req.query));
});

const complete = asyncHandler(async (req, res) => {
  ok(res, await deliveryService.complete(req.params.orderId));
});

const bulkComplete = asyncHandler(async (req, res) => {
  ok(res, await deliveryService.bulkComplete(req.body.ids));
});

module.exports = { getToday, complete, bulkComplete };
