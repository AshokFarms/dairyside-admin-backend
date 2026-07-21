const AdminSubscription = require('../models/adminSubscriptionModel');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');
const { istDateString } = require('../utils/dates');

const num = (v) => Number(v || 0);

function shapeRow(s) {
  return {
    id: s.id,
    customer_name: s.customer_name,
    product_name: s.product_name,
    variant_label: s.variant_label,
    frequency: s.frequency,
    quantity: num(s.quantity),
    delivery_slot: s.delivery_slot,
    status: s.status,
    start_date: s.start_date,
    end_date: s.end_date,
    next_delivery: s.next_delivery || null,
    price_per_delivery: num(s.sale_price) * num(s.quantity),
    created_at: s.created_at,
  };
}

async function list(query) {
  const { page, limit, offset, sortBy, sortOrder } = parsePagination(query, {
    sortable: ['id', 'start_date', 'created_at', 'status'],
    defaultSort: 'created_at',
  });
  const filters = { status: query.status, frequency: query.frequency, search: query.search };
  const { rows, total } = await AdminSubscription.list({
    filters,
    sortBy,
    sortOrder,
    limit,
    offset,
    today: istDateString(),
  });
  return { data: rows.map(shapeRow), page, limit, total };
}

async function getById(id) {
  const s = await AdminSubscription.findById(id);
  if (!s) throw new ApiError(404, 'Subscription not found');
  return {
    id: s.id,
    status: s.status,
    frequency: s.frequency,
    quantity: num(s.quantity),
    delivery_slot: s.delivery_slot,
    custom_days: s.custom_days,
    plan_days: s.plan_days,
    discount_pct: num(s.discount_pct),
    start_date: s.start_date,
    end_date: s.end_date,
    pause_start_date: s.pause_start_date,
    pause_end_date: s.pause_end_date,
    created_at: s.created_at,
    customer: { id: s.customer_id, name: s.customer_name, email: s.customer_email, phone: s.customer_phone },
    product: { name: s.product_name, variant_label: s.variant_label, sku: s.sku },
    price_per_delivery: num(s.sale_price) * num(s.quantity),
  };
}

async function updateStatus(id, status) {
  const affected = await AdminSubscription.updateStatus(id, status);
  if (!affected) throw new ApiError(404, 'Subscription not found');
  return { id, status };
}

async function getTrialPacks(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'claimed_at' });
  const { rows, total } = await AdminSubscription.listTrialClaims({ status: query.status, limit, offset });
  const data = rows.map((t) => ({
    id: t.id,
    customer_name: t.customer_name,
    product_name: t.product_name,
    variant_label: t.variant_label,
    status: t.status,
    claimed_at: t.claimed_at,
    delivery_date: t.delivery_date,
    order_id: t.order_id,
  }));
  return { data, page, limit, total };
}

module.exports = { list, getById, updateStatus, getTrialPacks };
