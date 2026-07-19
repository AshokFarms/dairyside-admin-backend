// Thin controllers — parse/forward input, delegate to the service, shape response.
const asyncHandler = require('../middleware/asyncHandler');
const { ok } = require('../utils/apiResponse');
const dashboardService = require('../services/dashboardService');

const getStats = asyncHandler(async (req, res) => {
  ok(res, await dashboardService.getStats());
});

const getRevenueChart = asyncHandler(async (req, res) => {
  ok(res, await dashboardService.getRevenueChart({ days: req.query.days }));
});

const getRecentOrders = asyncHandler(async (req, res) => {
  ok(res, await dashboardService.getRecentOrders({ limit: req.query.limit }));
});

const getLowStock = asyncHandler(async (req, res) => {
  ok(res, await dashboardService.getLowStock({ limit: req.query.limit }));
});

module.exports = { getStats, getRevenueChart, getRecentOrders, getLowStock };
