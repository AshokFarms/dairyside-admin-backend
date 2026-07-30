// Cross-process bridge: after the admin API changes an order's status on the
// shared DB, tell the CUSTOMER backend to push it to that customer in real time.
// Fire-and-forget — a notify failure must NEVER fail the admin operation (the DB
// is already updated; real-time is only an optimisation).
//
// We send ONLY order ids. The customer backend re-reads the owning user and the
// current status from the DB, so this process can never address another
// customer's socket even if it sent the wrong thing.
const axios = require('axios');
const config = require('./../config/env');
const logger = require('./../utils/logger');

async function notifyOrderStatusChange(orderIds) {
  const { customerApiUrl, internalSecret } = config.stock;
  if (!customerApiUrl || !internalSecret) return; // not configured — skip quietly

  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;

  try {
    await axios.post(
      `${customerApiUrl.replace(/\/$/, '')}/v1/internal/order-status-broadcast`,
      { orderIds: ids },
      { headers: { 'x-internal-secret': internalSecret }, timeout: 4000 }
    );
  } catch (err) {
    logger.warn('order.notify_failed', { message: err.message, orderIds: ids });
  }
}

module.exports = { notifyOrderStatusChange };
