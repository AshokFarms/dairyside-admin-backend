const pool = require('../config/database');

// Legacy model behind the kept /api/products alias (admin frontend's productSlice
// calls it via axiosConfig). Uses the REAL products columns; `image_url` is
// aliased to `thumbnail` because the current ProductList renders `row.thumbnail`.
const Product = {
  findAll: async () => {
    const sql = `
      SELECT
        p.id, p.name, p.slug, p.short_description,
        p.image_url AS thumbnail, p.badge,
        p.is_subscription_eligible, p.is_featured, p.is_active, p.created_at,
        c.name AS category_name,
        MIN(pv.sale_price) AS min_price,
        MAX(pv.sale_price) AS max_price,
        COUNT(pv.id) AS variants_count,
        COALESCE(SUM(pv.stock_quantity), 0) AS stock_total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      GROUP BY p.id
      ORDER BY p.created_at DESC;
    `;
    const [rows] = await pool.query(sql);
    return rows.map((r) => ({
      ...r,
      is_active: !!r.is_active,
      is_featured: !!r.is_featured,
      is_subscription_eligible: !!r.is_subscription_eligible,
    }));
  },

  findById: async (id) => {
    const sql = `
      SELECT
        p.*, p.image_url AS thumbnail,
        c.name AS category_name,
        MIN(pv.sale_price) AS min_price,
        MAX(pv.sale_price) AS max_price,
        COUNT(pv.id) AS variants_count,
        COALESCE(SUM(pv.stock_quantity), 0) AS stock_total
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
    const { name, slug, category_id, short_description, description, badge } = data;
    // Accept `thumbnail` or `image_url` from the client; store in image_url.
    const imageUrl = data.image_url || data.thumbnail || null;
    const [result] = await pool.query(
      `INSERT INTO products
        (name, slug, category_id, short_description, description, image_url, badge,
         is_subscription_eligible, is_featured, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, slug, category_id, short_description || null, description || null,
        imageUrl, badge || null,
        data.is_subscription_eligible ? 1 : 0,
        data.is_featured ? 1 : 0,
        data.is_active === undefined ? 1 : data.is_active ? 1 : 0,
      ]
    );
    return result.insertId;
  },

  update: async (id, data) => {
    const { name, slug, category_id, short_description, description, badge } = data;
    const imageUrl = data.image_url || data.thumbnail || null;
    const [result] = await pool.query(
      `UPDATE products SET
        name = ?, slug = ?, category_id = ?, short_description = ?, description = ?,
        image_url = ?, badge = ?, is_subscription_eligible = ?, is_featured = ?, is_active = ?
       WHERE id = ?`,
      [
        name, slug, category_id, short_description || null, description || null,
        imageUrl, badge || null,
        data.is_subscription_eligible ? 1 : 0,
        data.is_featured ? 1 : 0,
        data.is_active ? 1 : 0,
        id,
      ]
    );
    return result.affectedRows;
  },

  delete: async (id) => {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
    return result.affectedRows;
  },
};

module.exports = Product;
