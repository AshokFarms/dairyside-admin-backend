// Cross-process bridge: after the admin API changes stock on the shared DB, tell
// the CUSTOMER backend to broadcast the new value to connected shoppers in real
// time. Fire-and-forget — a notify failure must NEVER fail the admin operation
// (the DB is already updated; real-time is only an optimisation).
const axios = require('axios');
const config = require('./../config/env');
const logger = require('./../utils/logger');

async function notifyStockChange(variantIds) {
  const { customerApiUrl, internalSecret } = config.stock;
  if (!customerApiUrl || !internalSecret) return; // not configured (e.g. local) — skip quietly

  const ids = (Array.isArray(variantIds) ? variantIds : [variantIds])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;

  try {
    await axios.post(
      `${customerApiUrl.replace(/\/$/, '')}/v1/internal/stock-broadcast`,
      { variantIds: ids },
      { headers: { 'x-internal-secret': internalSecret }, timeout: 4000 }
    );
  } catch (err) {
    logger.warn('stock.notify_failed', { message: err.message, variantIds: ids });
  }
}

module.exports = { notifyStockChange };
