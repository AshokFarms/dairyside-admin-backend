const express = require('express');
const {
  getStats,
  getRevenueChart,
  getRecentOrders,
  getLowStock,
} = require('../controllers/dashboardController');

const router = express.Router();

router.get('/stats', getStats);
router.get('/revenue-chart', getRevenueChart);
router.get('/recent-orders', getRecentOrders);
router.get('/low-stock', getLowStock);

module.exports = router;
