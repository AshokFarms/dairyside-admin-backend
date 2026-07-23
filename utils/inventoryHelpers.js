// Pure inventory helpers for the admin API — mirrors the customer backend's
// utils/inventory.helpers.js (same DB, same semantics). Dependency-free.
const DEFAULT_LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 10;

const REASONS = Object.freeze({
  SALE: 'SALE', CANCEL: 'CANCEL', RESTOCK: 'RESTOCK', ADJUSTMENT: 'ADJUSTMENT', DAMAGE: 'DAMAGE',
});

function effectiveThreshold(t) {
  return t === null || t === undefined ? DEFAULT_LOW_STOCK_THRESHOLD : Number(t);
}

function toStock(n) {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function stockState(stock, threshold) {
  const s = toStock(stock);
  if (s <= 0) return 'OUT_OF_STOCK';
  if (s <= effectiveThreshold(threshold)) return 'LOW_STOCK';
  return 'IN_STOCK';
}

function stockSnapshot(variantId, stock, threshold) {
  const s = toStock(stock);
  return {
    productVariantId: Number(variantId),
    stock: s,
    inStock: s > 0,
    lowStock: stockState(s, threshold) === 'LOW_STOCK',
    state: stockState(s, threshold),
  };
}

// A manual delta must be a non-zero integer, sign-consistent with the reason.
function validateManualDelta(reason, rawDelta) {
  const delta = Math.trunc(Number(rawDelta));
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: 'delta must be a non-zero integer' };
  if (reason === REASONS.RESTOCK && delta < 0) return { ok: false, error: 'RESTOCK delta must be positive' };
  if (reason === REASONS.DAMAGE && delta > 0) return { ok: false, error: 'DAMAGE delta must be negative' };
  return { ok: true, delta };
}

module.exports = {
  DEFAULT_LOW_STOCK_THRESHOLD, REASONS, effectiveThreshold, toStock, stockState, stockSnapshot, validateManualDelta,
};
