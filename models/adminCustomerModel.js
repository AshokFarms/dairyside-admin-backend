// Data access for admin customer management. Customers are `users`; their
// orders/subscriptions/wallet are keyed on users.uid (string), so every join
// coerces collation (uid unicode_ci vs *.user_id 0900_ai_ci).
const pool = require('../config/database');

// Coerce the *.user_id side to users.uid's collation.
const C = 'COLLATE utf8mb4_unicode_ci';

const AdminCustomer = {
  list: async ({ search, sortBy, sortOrder, limit, offset }) => {
    const where = [];
    const params = [];
    if (search) {
      where.push('(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortable = { created_at: 'u.created_at', name: 'u.name', id: 'u.id' };
    const orderCol = sortable[sortBy] || 'u.created_at';

    const rowsSql = `
      SELECT u.id, u.uid, u.name, u.email, u.mobile AS phone, u.email_verified, u.created_at,
             COALESCE(w.balance, 0) AS wallet_balance,
             COALESCE(oc.cnt, 0) AS total_orders,
             COALESCE(sc.cnt, 0) AS active_subscriptions
      FROM users u
      LEFT JOIN wallets w ON w.user_id ${C} = u.uid
      LEFT JOIN (SELECT user_id, COUNT(*) cnt FROM orders GROUP BY user_id) oc ON oc.user_id ${C} = u.uid
      LEFT JOIN (SELECT user_id, COUNT(*) cnt FROM subscriptions WHERE status = 'active' GROUP BY user_id) sc ON sc.user_id ${C} = u.uid
      ${whereSql}
      ORDER BY ${orderCol} ${sortOrder}
      LIMIT ? OFFSET ?;
    `;
    const [rows] = await pool.query(rowsSql, [...params, limit, offset]);
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
    return { rows, total: countRows[0].total };
  },

  findById: async (id) => {
    const sql = `
      SELECT u.id, u.uid, u.name, u.email, u.mobile AS phone, u.email_verified,
             u.provider, u.created_at, u.last_login,
             COALESCE(w.balance, 0) AS wallet_balance,
             COALESCE(oc.cnt, 0) AS total_orders,
             COALESCE(sc.cnt, 0) AS active_subscriptions
      FROM users u
      LEFT JOIN wallets w ON w.user_id ${C} = u.uid
      LEFT JOIN (SELECT user_id, COUNT(*) cnt FROM orders GROUP BY user_id) oc ON oc.user_id ${C} = u.uid
      LEFT JOIN (SELECT user_id, COUNT(*) cnt FROM subscriptions WHERE status = 'active' GROUP BY user_id) sc ON sc.user_id ${C} = u.uid
      WHERE u.id = ?;
    `;
    const [rows] = await pool.query(sql, [id]);
    return rows[0] || null;
  },

  // Resolve a customer's Firebase uid from the numeric id (identity used by the UI).
  uidOf: async (id) => {
    const [rows] = await pool.query('SELECT uid FROM users WHERE id = ?', [id]);
    return rows[0] ? rows[0].uid : null;
  },

  ordersOf: async (uid, { limit, offset }) => {
    const sql = `
      SELECT o.id, o.total_amount, o.status, o.order_type, o.payment_status,
             o.delivery_date, o.created_at, o.quantity AS items_count,
             p.name AS product_name, pv.size_label
      FROM orders o
      LEFT JOIN product_variants pv ON pv.id = o.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?;
    `;
    const [rows] = await pool.query(sql, [uid, limit, offset]);
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM orders WHERE user_id = ?', [uid]);
    return { rows, total: countRows[0].total };
  },

  subscriptionsOf: async (uid) => {
    const sql = `
      SELECT s.id, s.status, s.frequency, s.quantity, s.delivery_slot,
             s.start_date, s.end_date, s.created_at,
             p.name AS product_name, pv.size_label, pv.sale_price
      FROM subscriptions s
      LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC;
    `;
    const [rows] = await pool.query(sql, [uid]);
    return rows;
  },

  walletBalance: async (uid) => {
    const [rows] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [uid]);
    return rows[0] ? Number(rows[0].balance) : 0;
  },

  walletTransactions: async (uid, { limit, offset }) => {
    const [rows] = await pool.query(
      `SELECT id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at
       FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [uid, limit, offset]
    );
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM wallet_transactions WHERE user_id = ?', [uid]);
    return { rows, total: countRows[0].total };
  },

  /**
   * Atomically adjust a wallet: lock the row, compute new balance, write the
   * ledger entry, upsert the balance — all in one transaction so balance and
   * ledger can never diverge.
   * NOTE: reference_type 'adjustment' requires the enum ALTER (see DDL handoff).
   */
  adjustWallet: async (uid, { type, amount, reason }) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [walletRows] = await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [uid]);
      const before = walletRows[0] ? Number(walletRows[0].balance) : 0;
      const delta = type === 'credit' ? Number(amount) : -Number(amount);
      const after = before + delta;
      if (after < 0) {
        const err = new Error('Insufficient wallet balance for this debit');
        err.statusCode = 400;
        throw err;
      }

      if (walletRows[0]) {
        await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [after, uid]);
      } else {
        await conn.query('INSERT INTO wallets (user_id, balance) VALUES (?, ?)', [uid, after]);
      }

      await conn.query(
        `INSERT INTO wallet_transactions
           (user_id, type, amount, balance_before, balance_after, reference_type, description)
         VALUES (?, ?, ?, ?, ?, 'adjustment', ?)`,
        [uid, type, amount, before, after, reason]
      );

      await conn.commit();
      return { balance_before: before, balance_after: after, type, amount: Number(amount) };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

module.exports = AdminCustomer;
