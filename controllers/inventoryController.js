const asyncHandler = require('../middleware/asyncHandler');
const { ok, paginated } = require('../utils/apiResponse');
const svc = require('../services/inventoryService');

// Every stock movement is attributable. Until admin auth is enabled (adminGuard
// runs in 'open' mode) the actor is 'admin:open'; once enabled it is the uid.
const actorOf = (req) => (req.admin && req.admin.uid) || 'admin:open';

// POST /v1/admin/inventory/variants/:id/restock   { qty, note? }
const restock = asyncHandler(async (req, res) =>
  ok(res, await svc.restock(req.params.id, req.body, actorOf(req)))
);

// POST /v1/admin/inventory/variants/:id/adjust    { delta, reason?, note }
const adjust = asyncHandler(async (req, res) =>
  ok(res, await svc.adjust(req.params.id, req.body, actorOf(req)))
);

// PATCH /v1/admin/inventory/variants/:id/threshold { threshold }
const setThreshold = asyncHandler(async (req, res) =>
  ok(res, await svc.setThreshold(req.params.id, req.body.threshold))
);

// GET /v1/admin/inventory/variants   (all active variants, searchable)
const variants = asyncHandler(async (req, res) => paginated(res, await svc.listVariants(req.query)));

// GET /v1/admin/inventory/low-stock
const lowStock = asyncHandler(async (req, res) => paginated(res, await svc.listLowStock(req.query)));

// GET /v1/admin/inventory/ledger
const ledger = asyncHandler(async (req, res) => paginated(res, await svc.listLedger(req.query)));

module.exports = { restock, adjust, setThreshold, variants, lowStock, ledger };
