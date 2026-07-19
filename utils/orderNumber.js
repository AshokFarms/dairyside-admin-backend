// The `orders` table has no order_number column, but the admin UI expects a
// human-readable reference. We synthesize a stable, deterministic display number
// from the row's created_at + id: SWD<YYMMDD>-<id padded to 4>.
// Deterministic → the same order always renders the same number.
function formatOrderNumber(id, createdAt) {
  const d = createdAt ? new Date(createdAt) : new Date();
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `SWD${yy}${mm}${dd}-${String(id).padStart(4, '0')}`;
}

module.exports = { formatOrderNumber };
