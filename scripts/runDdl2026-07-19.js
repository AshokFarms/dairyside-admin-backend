// One-shot DDL runner (2026-07-19) — executes the additive schema changes from
// docs/HANDOFF.md against the shared DB. Idempotent: every statement is guarded
// by an information_schema check, so re-running is a no-op. DDL only; no DML on
// customer data (delivery_slots seed rows are config, inserted only when the
// table is first created and empty).
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

async function enumHas(table, column, value) {
  const [r] = await pool.query(
    'SELECT COLUMN_TYPE ct FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    [DB, table, column]
  );
  return r.length > 0 && r[0].ct.includes(`'${value}'`);
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
    // ── 1. wallet_transactions enum + 'adjustment' ──
    await run(
      'ALTER wallet_transactions.reference_type += adjustment',
      () => enumHas('wallet_transactions', 'reference_type', 'adjustment'),
      `ALTER TABLE wallet_transactions MODIFY COLUMN reference_type
         ENUM('order','refund','topup','cashback','referral','trial_refund','adjustment') NULL`
    );

    // ── 2. serviceable_pincodes real columns ──
    for (const [col, ddl] of [
      ['delivery_fee', 'ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0'],
      ['min_order_amount', 'ADD COLUMN min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0'],
      ['morning', 'ADD COLUMN morning TINYINT(1) NOT NULL DEFAULT 1'],
      ['evening', 'ADD COLUMN evening TINYINT(1) NOT NULL DEFAULT 1'],
    ]) {
      await run(
        `ALTER serviceable_pincodes += ${col}`,
        () => columnExists('serviceable_pincodes', col),
        `ALTER TABLE serviceable_pincodes ${ddl}`
      );
    }

    // ── 3. New tables ──
    await run('CREATE coupons', () => tableExists('coupons'), `
      CREATE TABLE coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        description VARCHAR(255) NULL,
        discount_type ENUM('flat','percent') NOT NULL DEFAULT 'flat',
        discount_value DECIMAL(10,2) NOT NULL,
        min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        max_discount DECIMAL(10,2) NULL,
        usage_limit INT NULL,
        used_count INT NOT NULL DEFAULT 0,
        valid_from DATE NULL,
        valid_until DATE NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_coupons_active (is_active, valid_until)
      )`);

    await run('CREATE banners', () => tableExists('banners'), `
      CREATE TABLE banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(150) NULL,
        image_url VARCHAR(500) NOT NULL,
        link_url VARCHAR(500) NULL,
        display_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        starts_at DATETIME NULL,
        ends_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);

    await run('CREATE app_settings', () => tableExists('app_settings'), `
      CREATE TABLE app_settings (
        setting_key VARCHAR(80) PRIMARY KEY,
        setting_value TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);

    const hadSlots = await tableExists('delivery_slots');
    await run('CREATE delivery_slots', () => Promise.resolve(hadSlots), `
      CREATE TABLE delivery_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label VARCHAR(60) NOT NULL,
        shift ENUM('morning','evening') NOT NULL,
        cutoff_time TIME NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        display_order INT NOT NULL DEFAULT 0
      )`);
    if (!hadSlots) {
      // Seed the two canonical slots the customer app already uses as free text.
      await pool.query(`INSERT INTO delivery_slots (label, shift, cutoff_time, display_order) VALUES
        ('Before 7 AM', 'morning', '21:00:00', 1),
        ('6 PM – 9 PM', 'evening', '14:00:00', 2)`);
      done.push('SEED delivery_slots (2 canonical slots)');
    }

    await run('CREATE contact_messages', () => tableExists('contact_messages'), `
      CREATE TABLE contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(20) NULL,
        subject VARCHAR(255) NULL,
        message TEXT NOT NULL,
        status ENUM('new','responded','closed') NOT NULL DEFAULT 'new',
        admin_response TEXT NULL,
        responded_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_contact_status (status, created_at)
      )`);

    // ── 4. Indexes on hot admin query paths ──
    for (const [table, index, cols] of [
      ['orders', 'idx_orders_delivery_date', '(delivery_date, status)'],
      ['orders', 'idx_orders_user_created', '(user_id, created_at)'],
      ['subscriptions', 'idx_subs_status', '(status)'],
      ['subscription_deliveries', 'idx_sd_sub_date', '(subscription_id, delivery_date)'],
      ['wallet_transactions', 'idx_wallet_tx_user_created', '(user_id, created_at)'],
    ]) {
      await run(
        `INDEX ${table}.${index}`,
        () => indexExists(table, index),
        `CREATE INDEX ${index} ON ${table} ${cols}`
      );
    }

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
