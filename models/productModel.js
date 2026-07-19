const pool = require('../config/database');

const Product = {
  findAll: async () => {
    // Using the user's provided SQL logic but adding aggregation for variants
    const sql = `
      SELECT 
        p.id, p.name, p.slug, p.short_description, p.thumbnail,
        p.badge,
        p.is_subscription_eligible, p.subscription_discount,
        p.is_best_seller, p.is_featured, p.is_active, p.created_at,
        c.name as category_name,
        MIN(pv.sale_price) AS min_price,
        MAX(pv.sale_price) AS max_price,
        COUNT(pv.id) AS variants_count,
        SUM(pv.stock_quantity) AS stock_total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      GROUP BY p.id
      ORDER BY p.created_at DESC;
    `;
    const [rows] = await pool.query(sql);
    return rows.map(r => ({ ...r, is_active: !!r.is_active, is_featured: !!r.is_featured, is_subscription_eligible: !!r.is_subscription_eligible }));
  },

  findById: async (id) => {
    const sql = `
      SELECT 
        p.*,
        c.name as category_name,
        MIN(pv.sale_price) AS min_price,
        MAX(pv.sale_price) AS max_price,
        COUNT(pv.id) AS variants_count,
        SUM(pv.stock_quantity) AS stock_total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE p.id = ?
      GROUP BY p.id;
    `;
    const [rows] = await pool.query(sql, [id]);
    if (rows[0]) {
      rows[0].is_active = !!rows[0].is_active;
      rows[0].is_featured = !!rows[0].is_featured;
      rows[0].is_subscription_eligible = !!rows[0].is_subscription_eligible;
    }
    return rows[0];
  },

  create: async (data) => {
    const { 
      name, slug, category_id, short_description, description, 
      thumbnail, badge, is_subscription_eligible, is_featured, is_active 
    } = data;
    
    const [result] = await pool.query(
      `INSERT INTO products 
      (name, slug, category_id, short_description, description, thumbnail, badge, is_subscription_eligible, is_featured, is_active) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, slug, category_id, short_description || null, description || null, 
        thumbnail || null, badge || null, 
        is_subscription_eligible ? 1 : 0, is_featured ? 1 : 0, is_active === undefined ? 1 : (is_active ? 1 : 0)
      ]
    );
    return result.insertId;
  },

  update: async (id, data) => {
    const { 
      name, slug, category_id, short_description, description, 
      thumbnail, badge, is_subscription_eligible, is_featured, is_active 
    } = data;

    const [result] = await pool.query(
      `UPDATE products SET 
        name = ?, slug = ?, category_id = ?, short_description = ?, description = ?, 
        thumbnail = ?, badge = ?, is_subscription_eligible = ?, is_featured = ?, is_active = ?
      WHERE id = ?`,
      [
        name, slug, category_id, short_description || null, description || null, 
        thumbnail || null, badge || null, 
        is_subscription_eligible ? 1 : 0, is_featured ? 1 : 0, is_active ? 1 : 0, 
        id
      ]
    );
    return result.affectedRows;
  },

  delete: async (id) => {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
    return result.affectedRows;
  }
};

module.exports = Product;
