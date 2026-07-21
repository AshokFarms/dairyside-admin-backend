// Data access for admin subscription management + trial-pack claims.
const pool = require('../config/database');

const C = 'COLLATE utf8mb4_unicode_ci'; // coerce *.user_id to users.uid

function buildFilters(f = {}) {
  const clauses = [];
  const params = [];
  if (f.status) {
    clauses.push('s.status = ?');
    params.push(f.status);
  }
  if (f.frequency) {
    clauses.push('s.frequency = ?');
    params.push(f.frequency);
  }
  if (f.search) {
    clauses.push('(u.name LIKE ? OR u.email LIKE ? OR p.name LIKE ?)');
    const like = `%${f.search}%`;
    params.push(like, like, like);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const AdminSubscription = {
  list: async ({ filters, sortBy, sortOrder, limit, offset, today }) => {
    const { where, params } = buildFilters(filters);
    const sortable = { id: 's.id', start_date: 's.start_date', created_at: 's.created_at', status: 's.status' };
    const orderCol = sortable[sortBy] || 's.created_at';

    const rowsSql = `
      SELECT s.id, s.status, s.frequency, s.quantity, s.delivery_slot,
             s.start_date, s.end_date, s.created_at,
             COALESCE(u.name, u.email, 'Guest') AS customer_name,
             p.name AS product_name, pv.size_label AS variant_label, pv.sale_price,
             (SELECT MIN(sd.delivery_date) FROM subscription_deliveries sd
                WHERE sd.subscription_id = s.id AND sd.delivery_date >= ? AND sd.status = 'pending') AS next_delivery
      FROM subscriptions s
      LEFT JOIN users u ON u.uid = s.user_id ${C}
      LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      ${where}
      ORDER BY ${orderCol} ${sortOrder}
      LIMIT ? OFFSET ?;
    `;
    const [rows] = await pool.query(rowsSql, [today, ...params, limit, offset]);
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM subscriptions s
       LEFT JOIN users u ON u.uid = s.user_id ${C}
       LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
       LEFT JOIN products p ON p.id = pv.product_id ${where}`,
      params
    );
    return { rows, total: countRows[0].total };
  },

  findById: async (id) => {
    const sql = `
      SELECT s.*, u.id AS customer_id, COALESCE(u.name, u.email, 'Guest') AS customer_name,
             u.email AS customer_email, u.mobile AS customer_phone,
             p.name AS product_name, pv.size_label AS variant_label, pv.sale_price, pv.sku
      FROM subscriptions s
      LEFT JOIN users u ON u.uid = s.user_id ${C}
      LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE s.id = ?;
    `;
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
  },

  updateStatus: async (id, status) => {
    const [result] = await pool.query('UPDATE subscriptions SET status = ? WHERE id = ?', [status, id]);
    return result.affectedRows;
  },

  listTrialClaims: async ({ status, limit, offset }) => {
    const where = [];
    const params = [];
    if (status) {
      where.push('t.status = ?');
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rowsSql = `
      SELECT t.id, t.status, t.claimed_at, t.delivery_date, t.order_id,
             COALESCE(u.name, u.email, 'Guest') AS customer_name,
             p.name AS product_name, pv.size_label AS variant_label
      FROM free_trial_claims t
      LEFT JOIN users u ON u.uid = t.user_id ${C}
      LEFT JOIN products p ON p.id = t.trial_pack_id
      LEFT JOIN product_variants pv ON pv.id = t.product_variant_id
      ${whereSql}
      ORDER BY t.claimed_at DESC
      LIMIT ? OFFSET ?;
    `;
    const [rows] = await pool.query(rowsSql, [...params, limit, offset]);
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM free_trial_claims t ${whereSql}`, params);
    return { rows, total: countRows[0].total };
  },
};

module.exports = AdminSubscription;
