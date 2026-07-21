const pool = require('../config/database');

async function run() {
  try {
    console.log('Altering orders.status enum in database...');
    const query = `
      ALTER TABLE orders 
      MODIFY COLUMN status ENUM('pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'returned') 
      NOT NULL DEFAULT 'pending'
    `;
    const [result] = await pool.query(query);
    console.log('Altered successfully:', result);
  } catch (err) {
    console.error('Failed to alter enum:', err);
  } finally {
    await pool.end();
  }
}

run();
