// Data access for admin dashboard aggregates. All reads; uses conditional
// aggregation to keep the number of round-trips small (no per-row queries).
const pool = require('../config/database');

const Dashboard = {
  /**
   * Order-derived counters and revenue buckets in a single scan of `orders`.
   * Dates are IST YYYY-MM-DD strings computed by the caller.
   */
  orderAggregates: async ({ today, weekStart, monthStart }) => {
    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN status <> 'cancelled' AND delivery_date = ? THEN total_amount END), 0) AS todayRevenue,
        COALESCE(SUM(CASE WHEN status <> 'cancelled' AND delivery_date >= ? THEN total_amount END), 0) AS weekRevenue,
        COALESCE(SUM(CASE WHEN status <> 'cancelled' AND delivery_date >= ? THEN total_amount END), 0) AS monthRevenue,
        SUM(status = 'pending') AS pendingOrders,
        SUM(status = 'confirmed') AS processedOrders,
        SUM(status = 'delivered' AND delivery_date = ?) AS deliveredToday,
        SUM(status = 'cancelled') AS cancelledOrders
      FROM orders;
    `;
    const [rows] = await pool.query(sql, [today, weekStart, monthStart, today]);
    return rows[0];
  },

  /** Today's subscription deliveries split by slot + completion. */
  deliveryAggregates: async ({ today }) => {
    const sql = `
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(s.delivery_slot, '')) LIKE '%evening%' OR LOWER(COALESCE(s.delivery_slot, '')) LIKE '%pm%' OR LOWER(COALESCE(ds.shift, '')) = 'evening' THEN 1 ELSE 0 END) AS eveningDeliveries,
        SUM(CASE WHEN LOWER(COALESCE(s.delivery_slot, '')) LIKE '%evening%' OR LOWER(COALESCE(s.delivery_slot, '')) LIKE '%pm%' OR LOWER(COALESCE(ds.shift, '')) = 'evening' THEN 0 ELSE 1 END) AS morningDeliveries,
        SUM(o.status = 'delivered') AS completed,
        COUNT(*) AS total
      FROM orders o
      LEFT JOIN subscriptions s ON s.id = o.subscription_id
      LEFT JOIN delivery_slots ds ON LOWER(ds.label) = LOWER(s.delivery_slot)
      WHERE o.order_type = 'subscription_delivery' AND o.delivery_date = ?;
    `;
    const [rows] = await pool.query(sql, [today]);
    return rows[0];
  },

  /** Subscription counters. */
  subscriptionAggregates: async ({ today }) => {
    const sql = `
      SELECT
        SUM(status = 'active') AS activeSubscriptions,
        SUM(status = 'paused') AS pausedSubscriptions,
        SUM(DATE(created_at) = ?) AS newSubscriptions
      FROM subscriptions;
    `;
    const [rows] = await pool.query(sql, [today]);
    return rows[0];
  },

  /** Trial-pack conversion proxy: delivered / total claims. */
  trialAggregates: async () => {
    const sql = `
      SELECT COUNT(*) AS totalClaims, SUM(status = 'delivered') AS deliveredClaims
      FROM free_trial_claims;
    `;
    const [rows] = await pool.query(sql);
    return rows[0];
  },

  /** Customer counters. */
  customerAggregates: async ({ today }) => {
    const sql = `
      SELECT COUNT(*) AS totalCustomers, SUM(DATE(created_at) = ?) AS newCustomersToday
      FROM users;
    `;
    const [rows] = await pool.query(sql, [today]);
    return rows[0];
  },

  /** Count of variants at/below the low-stock threshold. */
  lowStockCount: async (threshold) => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS lowStockProducts FROM product_variants WHERE is_active = 1 AND stock_quantity <= ?',
      [threshold]
    );
    return rows[0].lowStockProducts;
  },

  /** Per-day revenue + order count for the last N days (by delivery date). */
  revenueSeries: async ({ fromDate }) => {
    const sql = `
      SELECT delivery_date AS date,
             COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_amount END), 0) AS revenue,
             COUNT(*) AS orders
      FROM orders
      WHERE delivery_date >= ?
      GROUP BY delivery_date
      ORDER BY delivery_date ASC;
    `;
    const [rows] = await pool.query(sql, [fromDate]);
    return rows;
  },

  /** Latest orders with customer name + item label. */
  recentOrders: async (limit) => {
    const sql = `
      SELECT o.id, o.total_amount AS total, o.status, o.order_type AS type,
             o.quantity AS items, o.created_at,
             COALESCE(u.name, u.email, 'Guest') AS customer
      FROM orders o
      -- users.uid is utf8mb4_unicode_ci, orders.user_id is utf8mb4_0900_ai_ci;
      -- coerce so the join collations match (mismatch errors out otherwise).
      LEFT JOIN users u ON u.uid = o.user_id COLLATE utf8mb4_unicode_ci
      ORDER BY o.created_at DESC
      LIMIT ?;
    `;
    const [rows] = await pool.query(sql, [limit]);
    return rows;
  },

  /** Variants at/below the threshold, with product + size labels. */
  lowStockItems: async (threshold, limit) => {
    const sql = `
      SELECT pv.id, p.name, pv.size_label AS variant, pv.stock_quantity AS stock
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.is_active = 1 AND pv.stock_quantity <= ?
      ORDER BY pv.stock_quantity ASC
      LIMIT ?;
    `;
    const [rows] = await pool.query(sql, [threshold, limit]);
    return rows;
  },
};

module.exports = Dashboard;
