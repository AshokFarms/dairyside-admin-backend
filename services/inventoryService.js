// ============================================================
//  services/inventoryService.js  (admin write path)
//  The admin-side counterpart to the customer backend's inventory.service.js.
//  It writes the SAME product_variants.stock_quantity and the SAME
//  stock_movements ledger on the SAME shared DB, using the SAME atomic-update +
//  ledger-in-one-transaction discipline — so admin changes and customer sales
//  reconcile against one ledger, with no bypass path. After each change it
//  notifies the customer backend to broadcast the new stock to shoppers.
//
//  Admin movements are order_id = NULL, actor_type = 'admin'; every one is
//  attributable to the acting admin (or 'admin:open' until auth is enabled).
// ============================================================

const pool = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { notifyStockChange } = require('./stockNotify');
const { parsePagination } = require('../utils/pagination');
const config = require('../config/env');
const {
  REASONS, stockSnapshot, validateManualDelta,
} = require('../utils/inventoryHelpers');

// Core primitive: apply one signed movement + ledger row on a caller's conn.
async function applyMovement(conn, { variantId, delta, reason, orderId = null, actor, actorType = 'admin', note = null }) {
  if (delta < 0) {
    const [r] = await conn.query(
      `UPDATE product_variants SET stock_quantity = stock_quantity + ?
        WHERE id = ? AND stock_quantity + ? >= 0`,
      [delta, variantId, delta]
    );
    if (r.affectedRows !== 1) {
      const [[row]] = await conn.query(`SELECT stock_quantity FROM product_variants WHERE id = ?`, [variantId]);
      if (!row) throw new ApiError(404, 'Variant not found');
      throw new ApiError(409, `Insufficient stock: only ${row.stock_quantity} available`);
    }
  } else {
    const [r] = await conn.query(`UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?`, [delta, variantId]);
    if (r.affectedRows !== 1) throw new ApiError(404, 'Variant not found');
  }

  const [[after]] = await conn.query(
    `SELECT stock_quantity, low_stock_threshold FROM product_variants WHERE id = ?`,
    [variantId]
  );
  await conn.query(
    `INSERT INTO stock_movements
       (product_variant_id, delta, reason, order_id, actor, actor_type, note, balance_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [variantId, delta, reason, orderId, actor, actorType, note, after.stock_quantity]
  );
  return stockSnapshot(variantId, after.stock_quantity, after.low_stock_threshold);
}

async function runMove(opts) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const snapshot = await applyMovement(conn, opts);
    await conn.commit();
    notifyStockChange([opts.variantId]); // fire-and-forget real-time push
    return snapshot;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* already rolled back */ }
    throw e;
  } finally {
    conn.release();
  }
}

// ── Writes ──
async function restock(variantId, { qty, note }, actor) {
  const q = Math.trunc(Number(qty));
  if (!(q > 0)) throw new ApiError(422, 'qty must be a positive integer');
  return runMove({ variantId: Number(variantId), delta: q, reason: REASONS.RESTOCK, actor, note: note || null });
}

async function adjust(variantId, { delta, reason = REASONS.ADJUSTMENT, note }, actor) {
  const check = validateManualDelta(reason, delta);
  if (!check.ok) throw new ApiError(422, check.error);
  if (!note || !String(note).trim()) throw new ApiError(422, 'A reason note is required for an adjustment');
  return runMove({ variantId: Number(variantId), delta: check.delta, reason, actor, note: String(note).trim() });
}

// Set an ABSOLUTE stock value via a ledger ADJUSTMENT (delta = target − current).
// Preserves the legacy PATCH /variants/:id/stock contract without bypassing the
// ledger. Locks the row so a concurrent sale can't make the delta stale.
async function setAbsoluteStock(variantId, target, actor, note) {
  const t = Math.trunc(Number(target));
  if (!(t >= 0)) throw new ApiError(422, 'stock_quantity must be an integer >= 0');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(`SELECT stock_quantity, low_stock_threshold FROM product_variants WHERE id = ? FOR UPDATE`, [Number(variantId)]);
    if (!row) { await conn.rollback(); throw new ApiError(404, 'Variant not found'); }

    const delta = t - row.stock_quantity;
    if (delta === 0) {
      await conn.commit();
      return stockSnapshot(variantId, row.stock_quantity, row.low_stock_threshold);
    }
    const snapshot = await applyMovement(conn, {
      variantId: Number(variantId), delta, reason: REASONS.ADJUSTMENT, actor,
      note: (note && String(note).trim()) || `set stock to ${t}`,
    });
    await conn.commit();
    notifyStockChange([Number(variantId)]);
    return snapshot;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* already rolled back */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function setThreshold(variantId, threshold) {
  const val = threshold === null || threshold === undefined || threshold === '' ? null : Math.trunc(Number(threshold));
  if (val !== null && !(val >= 0)) throw new ApiError(422, 'threshold must be an integer >= 0 or null');
  const [r] = await pool.query(`UPDATE product_variants SET low_stock_threshold = ? WHERE id = ?`, [val, Number(variantId)]);
  if (!r.affectedRows) throw new ApiError(404, 'Variant not found');
  notifyStockChange([Number(variantId)]); // low-stock badge may change for shoppers
  const [[row]] = await pool.query(`SELECT stock_quantity, low_stock_threshold FROM product_variants WHERE id = ?`, [Number(variantId)]);
  return { ...stockSnapshot(variantId, row.stock_quantity, row.low_stock_threshold), lowStockThreshold: row.low_stock_threshold };
}

// ── Reads ──
// All active variants with their current stock — the full inventory table, so
// admins can act on ANY variant (not only ones already low). Searchable by
// product name / sku, paginated.
async function listVariants(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'product_name', defaultOrder: 'ASC' });
  const dt = config.stock.defaultLowStockThreshold;
  const where = ['pv.is_active = 1'];
  const params = [dt];
  if (query.search && String(query.search).trim()) {
    where.push('(p.name LIKE ? OR pv.sku LIKE ?)');
    const like = `%${String(query.search).trim()}%`;
    params.push(like, like);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT pv.id AS product_variant_id, pv.sku, pv.size_label, pv.stock_quantity,
            pv.low_stock_threshold, COALESCE(pv.low_stock_threshold, ?) AS effective_threshold,
            p.id AS product_id, p.name AS product_name, p.image_url AS product_image
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       ${whereSql}
       ORDER BY p.name ASC, pv.id ASC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  // Count uses the same filter minus the leading threshold param.
  const countParams = params.slice(1); // drop the SELECT-list threshold param
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM product_variants pv JOIN products p ON p.id = pv.product_id ${whereSql}`,
    countParams
  );
  return { data: rows, page, limit, total };
}

async function listLowStock(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'stock_quantity', defaultOrder: 'ASC' });
  const dt = config.stock.defaultLowStockThreshold;
  const [rows] = await pool.query(
    `SELECT pv.id AS product_variant_id, pv.sku, pv.size_label, pv.stock_quantity,
            pv.low_stock_threshold, COALESCE(pv.low_stock_threshold, ?) AS effective_threshold,
            p.id AS product_id, p.name AS product_name, p.image_url AS product_image
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
      WHERE pv.is_active = 1 AND pv.stock_quantity <= COALESCE(pv.low_stock_threshold, ?)
      ORDER BY pv.stock_quantity ASC, pv.id ASC
      LIMIT ? OFFSET ?`,
    [dt, dt, limit, offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM product_variants pv
      WHERE pv.is_active = 1 AND pv.stock_quantity <= COALESCE(pv.low_stock_threshold, ?)`,
    [dt]
  );
  return { data: rows, page, limit, total };
}

async function listLedger(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'id', defaultOrder: 'DESC' });
  const where = [];
  const params = [];
  if (query.variant_id) { where.push('sm.product_variant_id = ?'); params.push(Number(query.variant_id)); }
  if (query.reason) { where.push('sm.reason = ?'); params.push(query.reason); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT sm.id, sm.created_at, sm.product_variant_id, sm.delta, sm.reason, sm.order_id,
            sm.actor, sm.actor_type, sm.note, sm.balance_after,
            pv.sku, pv.size_label, p.name AS product_name
       FROM stock_movements sm
       JOIN product_variants pv ON pv.id = sm.product_variant_id
       JOIN products p ON p.id = pv.product_id
       ${whereSql}
       ORDER BY sm.id DESC
       LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM stock_movements sm ${whereSql}`, params);
  return { data: rows, page, limit, total };
}

module.exports = {
  restock, adjust, setAbsoluteStock, setThreshold, listVariants, listLowStock, listLedger,
};
