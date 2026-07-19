const pool = require('../config/database');

const Category = {
  findAll: async (isActive = null) => {
    let whereClause = '';
    const params = [];
    if (isActive !== null) {
      whereClause = 'WHERE c.is_active = ?';
      params.push(isActive === true || isActive === 'true' || isActive === 1 ? 1 : 0);
    }
    
    // Left join products for product_count mapping the real grocery DB structure
    const sql = `
      SELECT 
        c.id, c.name, c.slug, c.description, c.image_url, c.icon_url,
        c.display_order, c.is_active, c.meta_title, c.meta_description,
        c.created_at, c.updated_at,
        COUNT(DISTINCT p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.display_order ASC;
    `;
    
    // Note: If 'products' table doesn't exist yet in local setup, this will throw an error locally.
    // Try catching or just creating a mock 'products' table if needed locally, but since user said tables exist, we trust it.
    try {
      const [rows] = await pool.query(sql, params);
      return rows.map(r => ({ ...r, is_active: !!r.is_active }));
    } catch(err) {
      // Fallback query if products table is missing during dev
      if (err.code === 'ER_NO_SUCH_TABLE') {
         const fallbackSql = `SELECT c.*, 0 as product_count FROM categories c ${whereClause} ORDER BY c.display_order ASC`;
         const [fallbackRows] = await pool.query(fallbackSql, params);
         return fallbackRows.map(r => ({ ...r, is_active: !!r.is_active }));
      }
      throw err;
    }
  },
  
  findById: async (id) => {
    const sql = `
      SELECT 
        c.id, c.name, c.slug, c.description, c.image_url, c.icon_url,
        c.display_order, c.is_active, c.meta_title, c.meta_description,
        c.created_at, c.updated_at,
        COUNT(DISTINCT p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE c.id = ?
      GROUP BY c.id;
    `;
    
    try {
      const [rows] = await pool.query(sql, [id]);
      if(rows[0]) rows[0].is_active = !!rows[0].is_active;
      return rows[0];
    } catch(err) {
       if (err.code === 'ER_NO_SUCH_TABLE') {
         const fallbackSql = `SELECT c.*, 0 as product_count FROM categories c WHERE id = ?`;
         const [fallbackRows] = await pool.query(fallbackSql, [id]);
         if(fallbackRows[0]) fallbackRows[0].is_active = !!fallbackRows[0].is_active;
         return fallbackRows[0];
      }
      throw err;
    }
  },
  
  create: async (data) => {
    const { name, slug, description, image_url, icon_url, display_order, is_active, meta_title, meta_description } = data;
    const [result] = await pool.query(
      `INSERT INTO categories 
      (name, slug, description, image_url, icon_url, display_order, is_active, meta_title, meta_description) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, description, image_url || null, icon_url || null, display_order || 0, is_active === undefined ? 1 : (is_active ? 1 : 0), meta_title || null, meta_description || null]
    );
    return result.insertId;
  },
  
  update: async (id, data) => {
    const { name, slug, description, image_url, icon_url, display_order, is_active, meta_title, meta_description } = data;
    const [result] = await pool.query(
      `UPDATE categories SET 
        name = ?, slug = ?, description = ?, image_url = ?, icon_url = ?, 
        display_order = ?, is_active = ?, meta_title = ?, meta_description = ? 
      WHERE id = ?`,
      [name, slug, description, image_url || null, icon_url || null, display_order || 0, is_active === undefined ? 1 : (is_active ? 1 : 0), meta_title || null, meta_description || null, id]
    );
    return result.affectedRows;
  },
  
  delete: async (id) => {
    const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    return result.affectedRows;
  }
};

module.exports = Category;
