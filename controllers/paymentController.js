const asyncHandler = require('../middleware/asyncHandler');
const { ok } = require('../utils/apiResponse');
const paymentSvc = require('../services/paymentService');

const getPaymentSettings = asyncHandler(async (req, res) => {
  const settings = await paymentSvc.getPaymentSettings();
  ok(res, settings);
});

const updatePaymentSettings = asyncHandler(async (req, res) => {
  const settings = await paymentSvc.updatePaymentSettings(req.body);
  ok(res, settings);
});

const getTransactionStats = asyncHandler(async (req, res) => {
  const stats = await paymentSvc.getTransactionStats();
  ok(res, stats);
});

const listTransactions = asyncHandler(async (req, res) => {
  const data = await paymentSvc.listTransactions(req.query);
  ok(res, data);
});

const getTransactionDetail = asyncHandler(async (req, res) => {
  const tx = await paymentSvc.getTransactionDetail(req.params.id);
  ok(res, tx);
});

const refundTransaction = asyncHandler(async (req, res) => {
  const result = await paymentSvc.refundTransaction(req.params.id, req.body || {});
  ok(res, result);
});

module.exports = {
  getPaymentSettings,
  updatePaymentSettings,
  getTransactionStats,
  listTransactions,
  getTransactionDetail,
  refundTransaction,
};
