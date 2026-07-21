// Data access for the daily delivery manifest + marking deliveries complete.
const pool = require('../config/database');

const C = 'COLLATE utf8mb4_unicode_ci';

const AdminDelivery = {
  /** Orders scheduled for a given IST date, with manifest fields. */
  forDate: async ({ date, shift }) => {
    const params = [date];
    let shiftClause = '';
    const eveningExpr = "(LOWER(COALESCE(s.delivery_slot, '')) LIKE '%evening%' OR LOWER(COALESCE(s.delivery_slot, '')) LIKE '%pm%' OR LOWER(COALESCE(ds.shift, '')) = 'evening')";
    if (shift === 'evening') shiftClause = `AND ${eveningExpr}`;
    else if (shift === 'morning') shiftClause = `AND NOT ${eveningExpr}`;

    const sql = `
      SELECT o.id, o.status, o.quantity, o.delivery_date, o.order_type,
             COALESCE(u.name, u.email, 'Guest') AS customer,
             u.mobile AS phone,
             p.name AS product_name, pv.size_label,
             s.delivery_slot,
             CASE WHEN LOWER(COALESCE(s.delivery_slot, '')) LIKE '%evening%' OR LOWER(COALESCE(s.delivery_slot, '')) LIKE '%pm%' OR LOWER(COALESCE(ds.shift, '')) = 'evening' THEN 'evening' ELSE 'morning' END AS shift,
             a.flat_no, a.street_name, a.area, a.pincode, a.phone AS address_phone
      FROM orders o
      LEFT JOIN users u ON u.uid = o.user_id ${C}
      LEFT JOIN product_variants pv ON pv.id = o.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      LEFT JOIN subscriptions s ON s.id = o.subscription_id
      LEFT JOIN delivery_slots ds ON LOWER(ds.label) = LOWER(s.delivery_slot)
      -- Subscription-delivery orders carry no address_id; fall back to the
      -- address on the subscription itself.
      LEFT JOIN user_addresses a ON a.id = COALESCE(o.address_id, s.address_id)
      WHERE o.delivery_date = ? ${shiftClause}
      ORDER BY shift ASC, o.id ASC;
    `;
    const [rows] = await pool.query(sql, params);
    return rows;
  },

  /** Mark one order delivered; mirror to subscription_deliveries when applicable. */
  complete: async (orderId) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        'SELECT id, subscription_id, delivery_date, order_type FROM orders WHERE id = ? FOR UPDATE',
        [orderId]
      );
      if (!rows.length) {
        await conn.rollback();
        return { found: false };
      }
      const order = rows[0];
      await conn.query("UPDATE orders SET status = 'delivered' WHERE id = ?", [orderId]);
      if (order.order_type === 'subscription_delivery' && order.subscription_id) {
        await conn.query(
          "UPDATE subscription_deliveries SET status = 'delivered' WHERE subscription_id = ? AND delivery_date = ?",
          [order.subscription_id, order.delivery_date]
        );
      }
      await conn.commit();
      return { found: true, id: orderId, status: 'delivered' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /** Bulk mark delivered (orders + matching subscription_deliveries) in one tx. */
  bulkComplete: async (ids) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query("UPDATE orders SET status = 'delivered' WHERE id IN (?)", [ids]);
      await conn.query(
        `UPDATE subscription_deliveries sd
         JOIN orders o ON o.subscription_id = sd.subscription_id AND o.delivery_date = sd.delivery_date
         SET sd.status = 'delivered'
         WHERE o.id IN (?) AND o.order_type = 'subscription_delivery'`,
        [ids]
      );
      await conn.commit();
      return result.affectedRows;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

module.exports = AdminDelivery;
