// Business logic for the admin dashboard: computes IST date boundaries, runs the
// aggregate queries in parallel, and shapes the result to the UI contract.
const Dashboard = require('../models/dashboardModel');
const config = require('../config/env');
const { istDateString, istDateStringMinus, istMonthStart } = require('../utils/dates');
const { formatOrderNumber } = require('../utils/orderNumber');

// No low_stock_threshold column exists yet; use a configurable constant.
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 20;

const num = (v) => Number(v || 0);
const pct = (part, total) => (total > 0 ? Math.round((num(part) / num(total)) * 100) : 0);

// The stats burst opens several pool connections at once; over the WAN to the
// managed DB a COLD pool occasionally times out on the first connect. One
// retry after a short pause rides through that without masking real outages.
const isTransient = (err) => err && (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET');
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isTransient(err)) throw err;
    await new Promise((r) => setTimeout(r, 500));
    return fn();
  }
}

async function getStats() {
  const today = istDateString();
  const weekStart = istDateStringMinus(6); // inclusive 7-day window
  const monthStart = istMonthStart();

  const [orders, deliveries, subs, trial, customers, lowStock] = await withRetry(() =>
    Promise.all([
      Dashboard.orderAggregates({ today, weekStart, monthStart }),
      Dashboard.deliveryAggregates({ today }),
      Dashboard.subscriptionAggregates({ today }),
      Dashboard.trialAggregates(),
      Dashboard.customerAggregates({ today }),
      Dashboard.lowStockCount(LOW_STOCK_THRESHOLD),
    ])
  );

  return {
    todayRevenue: num(orders.todayRevenue),
    weekRevenue: num(orders.weekRevenue),
    monthRevenue: num(orders.monthRevenue),
    pendingOrders: num(orders.pendingOrders),
    processedOrders: num(orders.processedOrders),
    deliveredToday: num(orders.deliveredToday),
    cancelledOrders: num(orders.cancelledOrders),
    activeSubscriptions: num(subs.activeSubscriptions),
    pausedSubscriptions: num(subs.pausedSubscriptions),
    newSubscriptions: num(subs.newSubscriptions),
    trialConversions: pct(trial.deliveredClaims, trial.totalClaims),
    morningDeliveries: num(deliveries.morningDeliveries),
    eveningDeliveries: num(deliveries.eveningDeliveries),
    deliveryCompletion: pct(deliveries.completed, deliveries.total),
    lowStockProducts: num(lowStock),
    totalCustomers: num(customers.totalCustomers),
    newCustomersToday: num(customers.newCustomersToday),
  };
}

async function getRevenueChart({ days = 7 } = {}) {
  const window = Math.min(Math.max(Number(days) || 7, 1), 90);
  const fromDate = istDateStringMinus(window - 1);
  const rows = await Dashboard.revenueSeries({ fromDate });
  return rows.map((r) => ({
    date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0, 10),
    revenue: num(r.revenue),
    orders: num(r.orders),
  }));
}

async function getRecentOrders({ limit = 10 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = await Dashboard.recentOrders(capped);
  return rows.map((r) => ({
    id: r.id,
    order_number: formatOrderNumber(r.id, r.created_at),
    customer: r.customer,
    items: num(r.items),
    total: num(r.total),
    status: r.status,
    type: r.type,
    created_at: r.created_at,
  }));
}

async function getLowStock({ limit = 20 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = await Dashboard.lowStockItems(LOW_STOCK_THRESHOLD, capped);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    variant: r.variant,
    stock: num(r.stock),
    threshold: LOW_STOCK_THRESHOLD,
  }));
}

module.exports = { getStats, getRevenueChart, getRecentOrders, getLowStock, LOW_STOCK_THRESHOLD };
