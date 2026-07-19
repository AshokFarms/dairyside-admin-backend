// Parse & clamp pagination + sorting query params so every list endpoint is
// bounded (never returns an unbounded collection) and safe from SQL injection
// on the ORDER BY column.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * @param {object} query - req.query
 * @param {object} opts
 * @param {string[]} opts.sortable - whitelist of columns allowed in ORDER BY
 * @param {string} opts.defaultSort - default column
 * @param {'ASC'|'DESC'} opts.defaultOrder
 * @returns {{ page:number, limit:number, offset:number, sortBy:string, sortOrder:'ASC'|'DESC' }}
 */
function parsePagination(query = {}, opts = {}) {
  const { sortable = [], defaultSort = 'created_at', defaultOrder = 'DESC' } = opts;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;

  // Only allow whitelisted columns — the value is interpolated into SQL.
  const requested = String(query.sortBy || query.sort || '').trim();
  const sortBy = sortable.includes(requested) ? requested : defaultSort;

  const requestedOrder = String(query.sortOrder || query.order || '').trim().toUpperCase();
  const sortOrder = requestedOrder === 'ASC' || requestedOrder === 'DESC' ? requestedOrder : defaultOrder;

  return { page, limit, offset, sortBy, sortOrder };
}

module.exports = { parsePagination, DEFAULT_LIMIT, MAX_LIMIT };
