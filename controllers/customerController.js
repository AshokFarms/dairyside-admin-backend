const asyncHandler = require('../middleware/asyncHandler');
const { ok, paginated } = require('../utils/apiResponse');
const customerService = require('../services/customerService');

const list = asyncHandler(async (req, res) => {
  paginated(res, await customerService.list(req.query));
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await customerService.getById(req.params.id));
});

const getOrders = asyncHandler(async (req, res) => {
  paginated(res, await customerService.getOrders(req.params.id, req.query));
});

const getSubscriptions = asyncHandler(async (req, res) => {
  ok(res, await customerService.getSubscriptions(req.params.id));
});

const getWallet = asyncHandler(async (req, res) => {
  ok(res, await customerService.getWallet(req.params.id, req.query));
});

const adjustWallet = asyncHandler(async (req, res) => {
  ok(res, await customerService.adjustWallet(req.params.id, req.body));
});

module.exports = { list, getById, getOrders, getSubscriptions, getWallet, adjustWallet };
