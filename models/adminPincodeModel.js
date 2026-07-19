// Data access for serviceable_pincodes (the customer app's coverage table).
const pool = require('../config/database');

const AdminPincode = {
  list: async ({ isActive, search, limit, offset }) => {
    const where = [];
    const params = [];
    if (isActive !== undefined) {
      where.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (search) {
      where.push('(pincode LIKE ? OR area_name LIKE ? OR city LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT id, pincode, area_name, city, state, is_active, launching_on,
              delivery_fee, min_order_amount, morning, evening, created_at, updated_at
       FROM serviceable_pincodes ${whereSql}
       ORDER BY pincode ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM serviceable_pincodes ${whereSql}`, params);
    return { rows, total: countRows[0].total };
  },

  findById: async (id) => {
    const [rows] = await pool.query('SELECT * FROM serviceable_pincodes WHERE id = ?', [id]);
    return rows[0] || null;
  },

  create: async (data) => {
    const [result] = await pool.query(
      `INSERT INTO serviceable_pincodes
        (pincode, area_name, city, state, is_active, launching_on,
         delivery_fee, min_order_amount, morning, evening)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.pincode,
        data.area_name || null,
        data.city || null,
        data.state || null,
        data.is_active === false ? 0 : 1,
        data.launching_on || null,
        data.delivery_fee ?? 0,
        data.min_order_amount ?? 0,
        data.morning === false ? 0 : 1,
        data.evening === false ? 0 : 1,
      ]
    );
    return result.insertId;
  },

  update: async (id, data) => {
    const fields = [];
    const params = [];
    ['area_name', 'city', 'state', 'launching_on', 'delivery_fee', 'min_order_amount'].forEach((k) => {
      if (data[k] !== undefined) {
        fields.push(`${k} = ?`);
        params.push(data[k] === '' ? null : data[k]);
      }
    });
    ['is_active', 'morning', 'evening'].forEach((k) => {
      if (data[k] !== undefined) {
        fields.push(`${k} = ?`);
        params.push(data[k] ? 1 : 0);
      }
    });
    if (!fields.length) return 0;
    params.push(id);
    const [result] = await pool.query(`UPDATE serviceable_pincodes SET ${fields.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  remove: async (id) => {
    const [result] = await pool.query('DELETE FROM serviceable_pincodes WHERE id = ?', [id]);
    return result.affectedRows;
  },
};

module.exports = AdminPincode;
