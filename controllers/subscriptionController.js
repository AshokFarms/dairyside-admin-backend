const asyncHandler = require('../middleware/asyncHandler');
const { ok, paginated } = require('../utils/apiResponse');
const subscriptionService = require('../services/subscriptionService');

const list = asyncHandler(async (req, res) => {
  paginated(res, await subscriptionService.list(req.query));
});

const getById = asyncHandler(async (req, res) => {
  ok(res, await subscriptionService.getById(req.params.id));
});

const updateStatus = asyncHandler(async (req, res) => {
  ok(res, await subscriptionService.updateStatus(req.params.id, req.body.status));
});

const getTrialPacks = asyncHandler(async (req, res) => {
  paginated(res, await subscriptionService.getTrialPacks(req.query));
});

module.exports = { list, getById, updateStatus, getTrialPacks };
