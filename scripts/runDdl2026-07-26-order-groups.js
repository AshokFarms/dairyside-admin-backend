// One-shot DDL runner (2026-07-26) — groups the per-line `orders` rows that
// make up a single customer order.
//
// PURELY ADDITIVE. One nullable column plus an index. Nothing is dropped and no
// existing value is overwritten — the backfill only writes rows where
// order_group_id IS NULL.
//
//   node scripts/runDdl2026-07-26-order-groups.js
//
// WHY
// ───
// Checkout writes ONE `orders` row per cart line, all paid for together. For
// Razorpay they share razorpay_order_id, but COD and wallet orders have that
// column NULL, so there is no way to ask "which rows were this one order?".
//
// The order confirmation page needs exactly that question answered, and so will
// invoices and any admin order view. Grouping on
// (user_id, address_id, delivery_date, created_at) works today only because the
// rows come from a single multi-row INSERT and share a timestamp to the second —
// that is an accident of implementation, not a guarantee. An explicit column
// makes it one.
const pool = require('../config/database');

const DB = process.env.DB_NAME || 'dairyside';

async function columnExists(table, column) {
  const [r] = await pool.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    [DB, table, column]
  );
  return r.length > 0;
}

async function indexExists(table, index) {
  const [r] = await pool.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ?',
    [DB, table, index]
  );
  return r.length > 0;
}

const done = [];
const skipped = [];

async function run(label, guard, sql) {
  if (await guard()) {
    skipped.push(label);
    return;
  }
  await pool.query(sql);
  done.push(label);
}

(async () => {
  try {
    await run(
      'ALTER orders += order_group_id',
      () => columnExists('orders', 'order_group_id'),
      'ALTER TABLE orders ADD COLUMN order_group_id VARCHAR(40) NULL'
    );

    await run(
      'INDEX orders.idx_orders_group',
      () => indexExists('orders', 'idx_orders_group'),
      'CREATE INDEX idx_orders_group ON orders (order_group_id)'
    );

    // ── Backfill, in two passes, only where the column is still NULL ──
    //
    // Pass 1: Razorpay rows already carry a real group key. Reuse it rather than
    // inventing one, so a group id stays traceable to its payment.
    const [rzp] = await pool.query(
      `UPDATE orders
          SET order_group_id = razorpay_order_id
        WHERE order_group_id IS NULL
          AND razorpay_order_id IS NOT NULL`
    );
    if (rzp.affectedRows) done.push(`BACKFILL from razorpay_order_id (${rzp.affectedRows} row(s))`);

    // Pass 2: COD / wallet / subscription rows. Rows inserted together share a
    // user, address, delivery date and timestamp; the group takes the id of its
    // lowest row, which is stable and unique. Derived in a subquery first
    // because MySQL cannot read the table it is updating in a correlated
    // subquery.
    const [rest] = await pool.query(
      `UPDATE orders o
         JOIN (
           SELECT user_id, address_id, delivery_date, created_at, MIN(id) AS anchor
             FROM orders
            WHERE order_group_id IS NULL
            GROUP BY user_id, address_id, delivery_date, created_at
         ) g
           ON  g.user_id       <=> o.user_id
          AND  g.address_id    <=> o.address_id
          AND  g.delivery_date <=> o.delivery_date
          AND  g.created_at    <=> o.created_at
          SET o.order_group_id = CONCAT('grp_', g.anchor)
        WHERE o.order_group_id IS NULL`
    );
    if (rest.affectedRows) done.push(`BACKFILL grouped by insert batch (${rest.affectedRows} row(s))`);

    const [[left]] = await pool.query('SELECT COUNT(*) AS n FROM orders WHERE order_group_id IS NULL');
    const [[groups]] = await pool.query('SELECT COUNT(DISTINCT order_group_id) AS n FROM orders');
    console.log('\n=== EXECUTED ===');
    done.forEach((d) => console.log('  +', d));
    console.log('=== SKIPPED (already present) ===');
    skipped.forEach((s) => console.log('  =', s));
    console.log(`\nrows still ungrouped: ${left.n}   distinct groups: ${groups.n}`);
    process.exitCode = Number(left.n) === 0 ? 0 : 1;
  } catch (err) {
    console.error('DDL FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
