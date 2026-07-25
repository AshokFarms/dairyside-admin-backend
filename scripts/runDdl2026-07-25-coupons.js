// One-shot DDL runner (2026-07-25) — schema for the coupon redemption system.
// Idempotent: every statement is guarded by an information_schema check, so
// re-running is a no-op.
//
// EXPAND-ONLY. Nothing is dropped and nothing loses data — this is the expand
// half of an expand/contract migration, safe to run against a live database:
//
//   step 2  adds `status` and backfills it from is_active. is_active STAYS, and
//           marketingService keeps writing both, so a rollback to the previous
//           code is a straight redeploy with no schema work.
//   step 3  widens valid_from/valid_until DATE → DATETIME. Lossless: every DATE
//           maps to midnight, and valid_until is nudged to end-of-day so
//           "valid until the 31st" keeps meaning through the 31st.
//
// The contract half — DROP COLUMN is_active — belongs in a separate migration,
// run only once nothing reads it. Do not fold it back in here.
//
//   node scripts/runDdl2026-07-25-coupons.js
//
// Money stays DECIMAL(10,2) to match every other money column in this schema
// (orders.total_amount, product_variants.sale_price, wallets.balance). Integer
// paise is the better representation, but only if the whole money path moves at
// once — a paise column feeding a decimal total is worse than either.
const pool = require('../config/database');

const DB = process.env.DB_NAME || 'dairyside';

async function tableExists(name) {
  const [r] = await pool.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [DB, name]
  );
  return r.length > 0;
}

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

async function columnType(table, column) {
  const [r] = await pool.query(
    'SELECT COLUMN_TYPE ct FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    [DB, table, column]
  );
  return r.length ? r[0].ct : null;
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
    // ── 1. Eligibility and scoping rules ──
    // Defaults preserve the behaviour of coupons created before this migration:
    // single use per customer, one-time orders, code-entry only, no first-order
    // restriction.
    for (const [col, ddl] of [
      ['per_user_limit', 'ADD COLUMN per_user_limit INT NULL DEFAULT 1'],
      ['first_order_only', 'ADD COLUMN first_order_only TINYINT(1) NOT NULL DEFAULT 0'],
      ['applies_to', "ADD COLUMN applies_to ENUM('one_time','subscription','both') NOT NULL DEFAULT 'one_time'"],
      ['visibility', "ADD COLUMN visibility ENUM('public','private') NOT NULL DEFAULT 'private'"],
      ['created_by', 'ADD COLUMN created_by VARCHAR(64) NULL'],
    ]) {
      await run(
        `ALTER coupons += ${col}`,
        () => columnExists('coupons', col),
        `ALTER TABLE coupons ${ddl}`
      );
    }

    // free_delivery is accepted by the schema but inert until DELIVERY_FEE is
    // non-zero in the customer backend (it is 0 today).
    await run(
      'ALTER coupons.discount_type += free_delivery',
      async () => (await columnType('coupons', 'discount_type') || '').includes("'free_delivery'"),
      `ALTER TABLE coupons MODIFY COLUMN discount_type
         ENUM('flat','percent','free_delivery') NOT NULL DEFAULT 'flat'`
    );

    // ── 2. is_active → status ──
    // 'draft' lets a campaign be built and reviewed before it can be redeemed;
    // 'paused' stops redemption without destroying the validity window. A
    // boolean cannot express either.
    await run(
      'ALTER coupons += status',
      () => columnExists('coupons', 'status'),
      `ALTER TABLE coupons
         ADD COLUMN status ENUM('draft','active','paused','expired')
         NOT NULL DEFAULT 'draft'`
    );
    // Backfill only rows still sitting on the 'draft' default, so re-running
    // never stomps a status an admin has since changed by hand.
    if (await columnExists('coupons', 'is_active')) {
      const [r] = await pool.query(
        "UPDATE coupons SET status = IF(is_active = 1, 'active', 'paused') WHERE status = 'draft'"
      );
      done.push(`BACKFILL coupons.status from is_active (${r.affectedRows} row(s))`);
      // is_active is deliberately KEPT. Dropping it is the contract migration,
      // to be run separately once no deployed code reads it.
    } else {
      skipped.push('BACKFILL coupons.status (no is_active column)');
    }

    // ── 3. DATE → DATETIME validity window ──
    // A DATE compared against UTC midnight expires a coupon 5.5h early for IST
    // customers. DATETIME lets the window be exact and removes the timezone
    // fudge the service would otherwise need.
    if ((await columnType('coupons', 'valid_from') || '').toLowerCase() === 'date') {
      await pool.query(`ALTER TABLE coupons
        MODIFY COLUMN valid_from  DATETIME NULL,
        MODIFY COLUMN valid_until DATETIME NULL`);
      // Make the last day inclusive to the second — a DATE of 2026-08-31 meant
      // "through the 31st", not "expiring at 00:00 on the 31st".
      await pool.query("UPDATE coupons SET valid_until = DATE_ADD(DATE(valid_until), INTERVAL '23:59:59' HOUR_SECOND) WHERE valid_until IS NOT NULL");
      done.push('ALTER coupons.valid_from/valid_until DATE → DATETIME');
    } else {
      skipped.push('ALTER coupons validity → DATETIME');
    }

    await run(
      'INDEX coupons.idx_coupons_lookup',
      () => indexExists('coupons', 'idx_coupons_lookup'),
      'CREATE INDEX idx_coupons_lookup ON coupons (status, valid_from, valid_until)'
    );
    await run(
      'INDEX coupons.idx_coupons_public',
      () => indexExists('coupons', 'idx_coupons_public'),
      'CREATE INDEX idx_coupons_public ON coupons (visibility, status, valid_until)'
    );

    // ── 4. The redemption ledger ──
    // Source of truth for who redeemed what. coupons.used_count is a
    // denormalised cache rebuildable from this table.
    //
    // uq_redemption_order — one redemption per order, ever. Stronger than
    //   (coupon_id, order_id): it also blocks two DIFFERENT coupons landing on
    //   one order, which is the correct rule while stacking is unsupported.
    //   MySQL permits many NULLs here, so pre-order reservations don't collide.
    // uq_redemption_idem  — makes a retried checkout a no-op, not a second
    //   discount.
    //
    // user_id is VARCHAR(255) to match orders.user_id exactly; a narrower
    // column would drop index usage on the join.
    //
    // No FK to orders: order_id is NULL between reservation and order creation.
    await run('CREATE coupon_redemptions', () => tableExists('coupon_redemptions'), `
      CREATE TABLE coupon_redemptions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        coupon_id INT NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        order_id INT NULL,
        subscription_id INT NULL,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        status ENUM('reserved','committed','released') NOT NULL DEFAULT 'reserved',
        idempotency_key VARCHAR(80) NOT NULL,
        reserved_until DATETIME NULL,
        released_reason VARCHAR(80) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_redemption_order (order_id),
        UNIQUE KEY uq_redemption_idem (idempotency_key),
        KEY idx_redemption_user (coupon_id, user_id, status),
        KEY idx_redemption_sweep (status, reserved_until),
        CONSTRAINT fk_redemption_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // ── 5. Per-customer commerce state ──
    // Two facts, one row, because first-order eligibility needs both:
    //
    //   paid_order_count    the durable fact — has this customer ever paid?
    //                       Maintained in the transaction that captures payment.
    //                       Read from here, never COUNT(*) on orders: the cron
    //                       writes subscription_delivery rows the customer never
    //                       placed, and pending/cancelled orders must not burn a
    //                       first-order offer.
    //
    //   first_order_claim_at  the mutex — is a first-order claim in flight?
    //                       Claimed atomically at reservation, released if the
    //                       payment never completes. Without the release, an
    //                       abandoned checkout would cost the customer their
    //                       first-order eligibility permanently.
    //
    // The claim UPDATE guards on BOTH, so it cannot be won by a customer who
    // already paid for something without a coupon.
    const hadState = await tableExists('user_commerce_state');
    await run('CREATE user_commerce_state', () => Promise.resolve(hadState), `
      CREATE TABLE user_commerce_state (
        user_id VARCHAR(255) NOT NULL PRIMARY KEY,
        paid_order_count INT NOT NULL DEFAULT 0,
        first_paid_order_at TIMESTAMP NULL,
        first_order_claim_at DATETIME NULL,
        lifetime_value DECIMAL(12,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    if (!hadState) {
      // Backfill so existing customers are not handed a first-order coupon.
      // Only one-time orders count — subscription_delivery rows are generated by
      // the cron, not placed by the customer.
      const [r] = await pool.query(`
        INSERT INTO user_commerce_state (user_id, paid_order_count, first_paid_order_at, lifetime_value)
        SELECT user_id,
               COUNT(*),
               MIN(created_at),
               COALESCE(SUM(total_amount), 0)
          FROM orders
         WHERE payment_status = 'paid'
           AND order_type = 'one_time'
         GROUP BY user_id`);
      done.push(`BACKFILL user_commerce_state (${r.affectedRows} customers)`);
    }

    // ── 6. Coupon snapshot on the order ──
    // Denormalised on purpose: coupons get paused and superseded, and a
    // historical order must stay reconstructible without joining a mutable row.
    for (const [col, ddl] of [
      ['coupon_id', 'ADD COLUMN coupon_id INT NULL'],
      ['coupon_code', 'ADD COLUMN coupon_code VARCHAR(40) NULL'],
      ['discount_amount', 'ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0'],
      ['subtotal_amount', 'ADD COLUMN subtotal_amount DECIMAL(10,2) NULL'],
    ]) {
      await run(
        `ALTER orders += ${col}`,
        () => columnExists('orders', col),
        `ALTER TABLE orders ${ddl}`
      );
    }

    await run(
      'INDEX orders.idx_orders_coupon',
      () => indexExists('orders', 'idx_orders_coupon'),
      'CREATE INDEX idx_orders_coupon ON orders (coupon_id)'
    );

    console.log('\n=== EXECUTED ===');
    done.forEach((d) => console.log('  +', d));
    console.log('=== SKIPPED (already present) ===');
    skipped.forEach((s) => console.log('  =', s));
    process.exitCode = 0;
  } catch (err) {
    console.error('DDL FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
