// Data access for coupons, banners, app settings, delivery slots, and contact
// messages (the tables created 2026-07-19).
const pool = require('../config/database');

// Generic helpers shared by the small CRUD tables.
async function listWithCount(table, { where = '', params = [], orderBy, limit, offset }) {
  const [rows] = await pool.query(
    `SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [count] = await pool.query(`SELECT COUNT(*) AS total FROM ${table} ${where}`, params);
  return { rows, total: count[0].total };
}

async function findById(table, id) {
  const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function updateFields(table, id, data, columns, boolColumns = []) {
  const fields = [];
  const params = [];
  columns.forEach((c) => {
    if (data[c] !== undefined) {
      fields.push(`${c} = ?`);
      params.push(data[c] === '' ? null : data[c]);
    }
  });
  boolColumns.forEach((c) => {
    if (data[c] !== undefined) {
      fields.push(`${c} = ?`);
      params.push(data[c] ? 1 : 0);
    }
  });
  if (!fields.length) return 0;
  params.push(id);
  const [result] = await pool.query(`UPDATE ${table} SET ${fields.join(', ')} WHERE id = ?`, params);
  return result.affectedRows;
}

const AdminMarketing = {
  // ── Coupons ──
  listCoupons: ({ isActive, search, limit, offset }) => {
    const clauses = [];
    const params = [];
    if (isActive !== undefined) {
      clauses.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (search) {
      clauses.push('(code LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return listWithCount('coupons', { where, params, orderBy: 'created_at DESC', limit, offset });
  },
  findCoupon: (id) => findById('coupons', id),
  createCoupon: async (d) => {
    const [result] = await pool.query(
      `INSERT INTO coupons
        (code, description, discount_type, discount_value, min_order_amount,
         max_discount, usage_limit, valid_from, valid_until, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.code, d.description || null, d.discount_type, d.discount_value,
        d.min_order_amount ?? 0, d.max_discount ?? null, d.usage_limit ?? null,
        d.valid_from || null, d.valid_until || null, d.is_active === false ? 0 : 1,
      ]
    );
    return result.insertId;
  },
  updateCoupon: (id, d) =>
    updateFields('coupons', id, d,
      ['code', 'description', 'discount_type', 'discount_value', 'min_order_amount', 'max_discount', 'usage_limit', 'valid_from', 'valid_until'],
      ['is_active']),
  deleteCoupon: async (id) => {
    const [result] = await pool.query('DELETE FROM coupons WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // ── Banners ──
  listBanners: ({ isActive, limit, offset }) => {
    const where = isActive !== undefined ? 'WHERE is_active = ?' : '';
    const params = isActive !== undefined ? [isActive ? 1 : 0] : [];
    return listWithCount('banners', { where, params, orderBy: 'display_order ASC, id ASC', limit, offset });
  },
  findBanner: (id) => findById('banners', id),
  createBanner: async (d) => {
    const [result] = await pool.query(
      `INSERT INTO banners (title, image_url, link_url, display_order, is_active, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [d.title || null, d.image_url, d.link_url || null, d.display_order ?? 0,
       d.is_active === false ? 0 : 1, d.starts_at || null, d.ends_at || null]
    );
    return result.insertId;
  },
  updateBanner: (id, d) =>
    updateFields('banners', id, d, ['title', 'image_url', 'link_url', 'display_order', 'starts_at', 'ends_at'], ['is_active']),
  deleteBanner: async (id) => {
    const [result] = await pool.query('DELETE FROM banners WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // ── Settings ──
  getSettings: async () => {
    const [rows] = await pool.query('SELECT setting_key, setting_value, updated_at FROM app_settings');
    return rows;
  },
  upsertSetting: (key, value) =>
    pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value]
    ),

  // ── Delivery slots ──
  listSlots: async () => {
    const [rows] = await pool.query('SELECT * FROM delivery_slots ORDER BY display_order ASC, id ASC');
    return rows;
  },
  findSlot: (id) => findById('delivery_slots', id),
  updateSlot: (id, d) =>
    updateFields('delivery_slots', id, d, ['label', 'shift', 'cutoff_time', 'display_order'], ['is_active']),

  // ── Contact messages ──
  listMessages: ({ status, limit, offset }) => {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    return listWithCount('contact_messages', { where, params, orderBy: 'created_at DESC', limit, offset });
  },
  findMessage: (id) => findById('contact_messages', id),
  respondMessage: async (id, { admin_response, status }) => {
    const [result] = await pool.query(
      `UPDATE contact_messages
       SET admin_response = COALESCE(?, admin_response),
           status = COALESCE(?, 'resolved'),
           responded_at = NOW()
       WHERE id = ?`,
      [admin_response ?? null, status ?? null, id]
    );
    return result.affectedRows;
  },
};

module.exports = AdminMarketing;
