const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');

// ── Payment Settings & Gateway Configuration ──
router.get('/payments/settings', c.getPaymentSettings);
router.put('/payments/settings', c.updatePaymentSettings);

// ── Payment Transactions Monitoring & Refunds ──
router.get('/payments/stats', c.getTransactionStats);
router.get('/payments/transactions', c.listTransactions);
router.get('/payments/transactions/:id', c.getTransactionDetail);
router.post('/payments/transactions/:id/refund', c.refundTransaction);

module.exports = router;
