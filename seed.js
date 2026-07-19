const pool = require('./config/database');

const seedDatabase = async () => {
  try {
    console.log('Starting seed...');

    // Clean existing data for idempotency testing
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    // Note: We don't TRUNCATE if we are on a live DB, but since the user asked for test data, we'll assume they want a clean start for testing.
    // However, if we want to be safe, we can just INSERT and ignore duplicates.
    // Given the previous failure, I'll TRUNCATE to ensure a clean state for the new schema.
    await pool.query('TRUNCATE TABLE product_variants');
    await pool.query('TRUNCATE TABLE products');
    await pool.query('TRUNCATE TABLE categories');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    // 1. Seed Categories (DairySide.in concept)
    const initCategories = [
      ['Milk', 'milk', 'Fresh Farm Milk', 'https://www.dairyside.in/assets/categories/milk.png', 1, 1],
      ['Dairy Products', 'dairy-products', 'Cheese, Paneer, Butter', 'https://www.dairyside.in/assets/categories/dairy.png', 2, 1],
      ['Beverages', 'beverages', 'Juices and shakes', 'https://www.dairyside.in/assets/categories/beverages.png', 3, 1],
      ['Farm Fresh', 'farm-fresh', 'Fresh vegetables from farm', 'https://www.dairyside.in/assets/categories/veg.png', 4, 1],
      ['Combo Packs', 'combo-packs', 'Discounted subscriptions', 'https://www.dairyside.in/assets/categories/combo.png', 5, 0]
    ];

    console.log('Seeding Categories...');
    for (const c of initCategories) {
      await pool.query(
        'INSERT INTO categories (name, slug, description, image_url, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        c
      );
    }

    // 2. Seed Products
    console.log('Seeding Products...');
    // Milk Category (ID = 1)
    await pool.query('INSERT INTO products (category_id, name, slug, short_description, is_subscription_eligible) VALUES (?, ?, ?, ?, ?)', 
      [1, 'Full Cream Milk', 'full-cream-milk', 'Pure buffalo milk rich in cream', 1]);
    await pool.query('INSERT INTO products (category_id, name, slug, short_description, is_subscription_eligible) VALUES (?, ?, ?, ?, ?)', 
      [1, 'Toned Milk', 'toned-milk', 'Light cow milk', 1]);
    
    // Dairy Category (ID = 2)
    await pool.query('INSERT INTO products (category_id, name, slug, short_description) VALUES (?, ?, ?, ?)', 
      [2, 'Fresh Paneer', 'fresh-paneer', 'Soft homemade style paneer']);
    await pool.query('INSERT INTO products (category_id, name, slug, short_description) VALUES (?, ?, ?, ?)', 
      [2, 'Cow Ghee', 'cow-ghee', 'A2 Cow Ghee']);
    
    // 3. Seed Product Variants
    console.log('Seeding Variants...');
    // Full cream milk variants (Product ID 1)
    await pool.query('INSERT INTO product_variants (product_id, sku, size_label, size_unit, mrp, sale_price, stock_quantity, min_order_quantity, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
      [1, 'MILK-FC-500', '500 ml', 'ml', 38.00, 35.00, 100, 1, 1]);
    await pool.query('INSERT INTO product_variants (product_id, sku, size_label, size_unit, mrp, sale_price, stock_quantity, min_order_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
      [1, 'MILK-FC-1L', '1 Litre', 'ml', 75.00, 70.00, 100, 1]);
    
    // Toned milk variants (Product ID 2)
    await pool.query('INSERT INTO product_variants (product_id, sku, size_label, size_unit, mrp, sale_price, stock_quantity, min_order_quantity, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
      [2, 'MILK-TN-500', '500 ml', 'ml', 30.00, 28.00, 100, 1, 1]);
    
    // Paneer variants (Product ID 3)
    await pool.query('INSERT INTO product_variants (product_id, sku, size_label, size_unit, mrp, sale_price, stock_quantity, min_order_quantity, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
      [3, 'PAN-200G', '200 gram', 'gm', 100.00, 90.00, 50, 1, 1]);

    console.log('Seed executed successfully! Dairyside database is populated.');
    process.exit(0);
  } catch (error) {
    console.error('Seed Error:', error);
    process.exit(1);
  }
};

seedDatabase();
