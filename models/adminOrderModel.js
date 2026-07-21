// Data access for admin order management. Reads join users/variants/products;
// user joins coerce collation (orders.user_id 0900_ai_ci vs users.uid unicode_ci).
const pool = require('../config/database');

const USER_JOIN = 'LEFT JOIN users u ON u.uid = o.user_id COLLATE utf8mb4_unicode_ci';

// Build the shared WHERE clause + params from filters.
function buildFilters(f = {}) {
  const clauses = [];
  const params = [];
  if (f.status) {
    clauses.push('o.status = ?');
    params.push(f.status);
  }
  if (f.order_type) {
    clauses.push('o.order_type = ?');
    params.push(f.order_type);
  }
  if (f.payment_status) {
    clauses.push('o.payment_status = ?');
    params.push(f.payment_status);
  }
  if (f.dateFrom) {
    clauses.push('o.delivery_date >= ?');
    params.push(f.dateFrom);
  }
  if (f.dateTo) {
    clauses.push('o.delivery_date <= ?');
    params.push(f.dateTo);
  }
  if (f.search) {
    // Numeric search → order id; otherwise customer name/email/mobile.
    if (/^\d+$/.test(f.search)) {
      clauses.push('o.id = ?');
      params.push(Number(f.search));
    } else {
      clauses.push('(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)');
      const like = `%${f.search}%`;
      params.push(like, like, like);
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const AdminOrder = {
  list: async ({ filters, sortBy, sortOrder, limit, offset }) => {
    const { where, params } = buildFilters(filters);
    const sortable = { id: 'o.id', delivery_date: 'o.delivery_date', total_amount: 'o.total_amount', created_at: 'o.created_at', status: 'o.status' };
    const orderCol = sortable[sortBy] || 'o.created_at';

    const rowsSql = `
      SELECT o.id, o.total_amount, o.status, o.order_type, o.payment_status,
             o.delivery_date, o.created_at, o.quantity AS items_count,
             COALESCE(u.name, u.email, 'Guest') AS customer_name,
             u.mobile AS customer_phone,
             s.delivery_slot,
             CASE WHEN LOWER(COALESCE(s.delivery_slot, '')) LIKE '%evening%' OR LOWER(COALESCE(s.delivery_slot, '')) LIKE '%pm%' OR LOWER(COALESCE(ds.shift, '')) = 'evening' THEN 'evening' ELSE 'morning' END AS delivery_shift
      FROM orders o
      ${USER_JOIN}
      LEFT JOIN subscriptions s ON s.id = o.subscription_id
      LEFT JOIN delivery_slots ds ON LOWER(ds.label) = LOWER(s.delivery_slot)
      ${where}
      ORDER BY ${orderCol} ${sortOrder}
      LIMIT ? OFFSET ?;
    `;
    const [rows] = await pool.query(rowsSql, [...params, limit, offset]);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${USER_JOIN} ${where}`,
      params
    );
    return { rows, total: countRows[0].total };
  },

  findById: async (id) => {
    const sql = `
      SELECT o.*, o.quantity AS items_count,
             COALESCE(u.name, u.email, 'Guest') AS customer_name,
             u.email AS customer_email, u.mobile AS customer_phone,
             pv.size_label, pv.sku, pv.sale_price,
             p.name AS product_name,
             s.delivery_slot,
             CASE WHEN LOWER(COALESCE(s.delivery_slot, '')) LIKE '%evening%' OR LOWER(COALESCE(s.delivery_slot, '')) LIKE '%pm%' OR LOWER(COALESCE(ds.shift, '')) = 'evening' THEN 'evening' ELSE 'morning' END AS delivery_shift,
             a.flat_no, a.street_name, a.landmark, a.area, a.pincode, a.phone AS address_phone
      FROM orders o
      ${USER_JOIN}
      LEFT JOIN product_variants pv ON pv.id = o.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      LEFT JOIN subscriptions s ON s.id = o.subscription_id
      LEFT JOIN delivery_slots ds ON LOWER(ds.label) = LOWER(s.delivery_slot)
      -- Subscription-delivery orders carry no address_id; fall back to the
      -- address on the subscription itself.
      LEFT JOIN user_addresses a ON a.id = COALESCE(o.address_id, s.address_id)
      WHERE o.id = ?;
    `;
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
  },

  updateStatus: async (id, status) => {
    const [result] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    return result.affectedRows;
  },

  bulkUpdateStatus: async (ids, status) => {
    const [result] = await pool.query('UPDATE orders SET status = ? WHERE id IN (?)', [status, ids]);
    return result.affectedRows;
  },
};

module.exports = AdminOrder;
