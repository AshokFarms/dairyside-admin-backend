// ============================================================
//  controllers/internalEventsController.js
//  The CUSTOMER→ADMIN half of the real-time bridge (the mirror of the admin→
//  customer stock/order bridge). The customer backend is a separate process, so
//  it cannot reach this process's Socket.IO server directly; it POSTs the
//  affected ids here and we re-read the DB and push to connected admins.
//
//  Everything is re-read from the DB — the request body only ever supplies ids.
//  That keeps the caller unable to inject a fabricated order value or stock
//  level onto an operator's screen.
// ============================================================

const asyncHandler = require('../middleware/asyncHandler');
const { ok } = require('../utils/apiResponse');
const pool = require('../config/database');
const config = require('../config/env');
const { emitToAdmins } = require('../services/socket');
const logger = require('../utils/logger');

const idList = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);

async function announceNewOrders(orderIds) {
  const ids = idList(orderIds);
  if (ids.length === 0) return 0;

  const [rows] = await pool.query(
    `SELECT id, status, total_amount, payment_method, payment_status, created_at
       FROM orders
      WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  // Only announce orders ops can actually act on. A Razorpay order row is
  // created BEFORE payment, so announcing every insert would put orders on the
  // board that may never be paid. COD is actionable the moment it is placed.
  const actionable = rows.filter(
    (r) => r.payment_status === 'paid' || String(r.payment_method).toLowerCase() === 'cod'
  );

  for (const r of actionable) {
    emitToAdmins('order:new', {
      orderId: r.id,
      status: r.status,
      totalAmount: Number(r.total_amount),
      paymentMethod: r.payment_method,
      createdAt: r.created_at,
    });
  }
  return actionable.length;
}

async function announceLowStock(variantIds) {
  const ids = idList(variantIds);
  if (ids.length === 0) return 0;

  const [rows] = await pool.query(
    `SELECT pv.id, pv.stock_quantity, pv.low_stock_threshold, pv.size_label, p.name AS product_name
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
      WHERE pv.id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  // Re-derive "is low" here rather than trusting the caller's verdict.
  //
  // low_stock_threshold is nullable and in practice usually IS null, so it must
  // fall back to the configured default — exactly as the storefront's
  // stockState() does. Treating null as "no threshold" would silently drop most
  // alerts while the shop floor showed "Only N left".
  const fallback = config.stock.defaultLowStockThreshold;
  const thresholdOf = (r) => (r.low_stock_threshold == null ? fallback : Number(r.low_stock_threshold));

  const low = rows.filter((r) => Number(r.stock_quantity) <= thresholdOf(r));

  for (const r of low) {
    emitToAdmins('stock:low', {
      productVariantId: r.id,
      productName: r.product_name,
      sizeLabel: r.size_label,
      stock: Number(r.stock_quantity),
      threshold: thresholdOf(r),
      state: Number(r.stock_quantity) <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
    });
  }
  return low.length;
}

/**
 * A farm visit was booked on the storefront.
 *
 * Re-read like everything else here, so the customer backend cannot put a
 * headcount or a visitor name on an operator's screen that the DB does not
 * agree with. Only live bookings are announced: by the time this arrives the
 * visitor may already have cancelled, and a cancelled booking on the live feed
 * would send staff chasing a visit that is not happening.
 */
async function announceFarmVisitBookings(bookingIds) {
  const ids = idList(bookingIds);
  if (ids.length === 0) return 0;

  const [rows] = await pool.query(
    `SELECT b.id, b.booking_ref, b.visitor_name, b.visitor_phone, b.adults, b.children,
            b.seats, b.status, s.visit_date, s.start_time, f.name AS farm_name
       FROM farm_visit_bookings b
       JOIN farm_visit_slots s ON s.id = b.slot_id
       JOIN farms f            ON f.id = b.farm_id
      WHERE b.id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  const live = rows.filter((r) => r.status === 'PENDING' || r.status === 'CONFIRMED');

  for (const r of live) {
    emitToAdmins('farmVisit:new', {
      bookingId: r.id,
      bookingRef: r.booking_ref,
      visitorName: r.visitor_name,
      visitorPhone: r.visitor_phone,
      adults: Number(r.adults),
      children: Number(r.children),
      seats: Number(r.seats),
      status: r.status,
      visitDate: r.visit_date,
      startTime: r.start_time,
      farmName: r.farm_name,
    });
  }
  return live.length;
}

// POST /v1/admin/internal/events
//   { type: 'order:new',    orderIds: [...] }
//   { type: 'stock:low',    variantIds: [...] }
//   { type: 'farmVisit:new', bookingIds: [...] }
const events = asyncHandler(async (req, res) => {
  const { type } = req.body || {};
  let announced = 0;

  if (type === 'order:new') announced = await announceNewOrders(req.body.orderIds);
  else if (type === 'stock:low') announced = await announceLowStock(req.body.variantIds);
  else if (type === 'farmVisit:new') announced = await announceFarmVisitBookings(req.body.bookingIds);
  else return res.status(400).json({ success: false, error: 'Unknown event type' });

  logger.debug?.('admin.internal_event', { type, announced });
  return ok(res, { announced });
});

module.exports = { events };
