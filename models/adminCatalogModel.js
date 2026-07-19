// Data access for admin catalog management (products + variants + categories),
// using the REAL column names (products.image_url, not the legacy 'thumbnail').
const pool = require('../config/database');

const AdminCatalog = {
  // ── Products ──
  listProducts: async ({ filters, sortBy, sortOrder, limit, offset }) => {
    const where = [];
    const params = [];
    if (filters.category_id) {
      where.push('p.category_id = ?');
      params.push(filters.category_id);
    }
    if (filters.is_active !== undefined) {
      where.push('p.is_active = ?');
      params.push(filters.is_active ? 1 : 0);
    }
    if (filters.is_subscription_eligible !== undefined) {
      where.push('p.is_subscription_eligible = ?');
      params.push(filters.is_subscription_eligible ? 1 : 0);
    }
    if (filters.search) {
      where.push('(p.name LIKE ? OR p.slug LIKE ?)');
      const like = `%${filters.search}%`;
      params.push(like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortable = { name: 'p.name', created_at: 'p.created_at', display_order: 'p.display_order', id: 'p.id' };
    const orderCol = sortable[sortBy] || 'p.created_at';

    const rowsSql = `
      SELECT p.id, p.name, p.slug, p.short_description, p.image_url, p.badge,
             p.is_subscription_eligible, p.is_featured, p.is_active, p.display_order, p.created_at,
             c.name AS category_name,
             MIN(pv.sale_price) AS min_price, MAX(pv.sale_price) AS max_price,
             COUNT(pv.id) AS variants_count, COALESCE(SUM(pv.stock_quantity), 0) AS stock_total
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      ${whereSql}
      GROUP BY p.id
      ORDER BY ${orderCol} ${sortOrder}
      LIMIT ? OFFSET ?;
    `;
    const [rows] = await pool.query(rowsSql, [...params, limit, offset]);
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM products p ${whereSql}`, params);
    return { rows, total: countRows[0].total };
  },

  findProductById: async (id) => {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    const [variants] = await pool.query(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, id ASC',
      [id]
    );
    return { ...rows[0], variants };
  },

  createProduct: async (d) => {
    const [result] = await pool.query(
      `INSERT INTO products
        (name, slug, category_id, short_description, description, image_url, badge,
         is_subscription_eligible, is_featured, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.name, d.slug, d.category_id, d.short_description || null, d.description || null,
        d.image_url || null, d.badge || null,
        d.is_subscription_eligible ? 1 : 0, d.is_featured ? 1 : 0,
        d.is_active === false ? 0 : 1, d.display_order || 0,
      ]
    );
    return result.insertId;
  },

  updateProduct: async (id, d) => {
    const map = {
      name: 'name', slug: 'slug', category_id: 'category_id', short_description: 'short_description',
      description: 'description', image_url: 'image_url', badge: 'badge', display_order: 'display_order',
    };
    const fields = [];
    const params = [];
    Object.entries(map).forEach(([key, col]) => {
      if (d[key] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(d[key] === '' ? null : d[key]);
      }
    });
    ['is_subscription_eligible', 'is_featured', 'is_active'].forEach((k) => {
      if (d[k] !== undefined) {
        fields.push(`${k} = ?`);
        params.push(d[k] ? 1 : 0);
      }
    });
    if (!fields.length) return 0;
    params.push(id);
    const [result] = await pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  deleteProduct: async (id) => {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // ── Variants ──
  productExists: async (id) => {
    const [rows] = await pool.query('SELECT id FROM products WHERE id = ?', [id]);
    return rows.length > 0;
  },

  findVariantById: async (id) => {
    const [rows] = await pool.query('SELECT * FROM product_variants WHERE id = ?', [id]);
    return rows[0] || null;
  },

  createVariant: async (productId, d) => {
    const [result] = await pool.query(
      `INSERT INTO product_variants
        (product_id, sku, size_label, size_value, size_unit, mrp, sale_price,
         stock_quantity, min_order_quantity, max_order_quantity, is_default, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, d.sku, d.size_label || null, d.size_value ?? null, d.size_unit,
        d.mrp, d.sale_price, d.stock_quantity ?? 0, d.min_order_quantity ?? 1,
        d.max_order_quantity ?? 10, d.is_default ? 1 : 0, d.is_active === false ? 0 : 1,
      ]
    );
    return result.insertId;
  },

  updateVariant: async (id, d) => {
    const cols = ['sku', 'size_label', 'size_value', 'size_unit', 'mrp', 'sale_price', 'stock_quantity', 'min_order_quantity', 'max_order_quantity'];
    const fields = [];
    const params = [];
    cols.forEach((c) => {
      if (d[c] !== undefined) {
        fields.push(`${c} = ?`);
        params.push(d[c]);
      }
    });
    ['is_default', 'is_active'].forEach((c) => {
      if (d[c] !== undefined) {
        fields.push(`${c} = ?`);
        params.push(d[c] ? 1 : 0);
      }
    });
    if (!fields.length) return 0;
    params.push(id);
    const [result] = await pool.query(`UPDATE product_variants SET ${fields.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  updateStock: async (id, stockQuantity) => {
    const [result] = await pool.query('UPDATE product_variants SET stock_quantity = ? WHERE id = ?', [stockQuantity, id]);
    return result.affectedRows;
  },

  // ── Categories ──
  listCategories: async ({ isActive, limit, offset }) => {
    const where = [];
    const params = [];
    if (isActive !== undefined) {
      where.push('c.is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.slug, c.description, c.image_url, c.icon_url, c.display_order,
              c.is_active, c.meta_title, c.meta_description, c.created_at, c.updated_at,
              COUNT(DISTINCT p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       ${whereSql}
       GROUP BY c.id
       ORDER BY c.display_order ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM categories c ${whereSql}`, params);
    return { rows, total: countRows[0].total };
  },
};

module.exports = AdminCatalog;
