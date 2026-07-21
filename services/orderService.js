// Order business logic + response shaping to the admin UI contract.
const AdminOrder = require('../models/adminOrderModel');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');
const { formatOrderNumber } = require('../utils/orderNumber');
const { notifyOrdersDelivered } = require('./orderNotification.service');

const num = (v) => Number(v || 0);

function shapeRow(o) {
  return {
    id: o.id,
    order_number: formatOrderNumber(o.id, o.created_at),
    customer_name: o.customer_name,
    customer_phone: o.customer_phone || null,
    items_count: num(o.items_count),
    total_amount: num(o.total_amount),
    status: o.status,
    order_type: o.order_type,
    payment_status: o.payment_status,
    delivery_shift: o.delivery_shift,
    delivery_slot: o.delivery_slot,
    delivery_date: o.delivery_date,
    created_at: o.created_at,
  };
}

function buildAddress(o) {
  if (!o.pincode && !o.street_name) return null;
  return {
    flat_no: o.flat_no,
    street_name: o.street_name,
    landmark: o.landmark,
    area: o.area,
    pincode: o.pincode,
    phone: o.address_phone,
    // Single display string so the UI never has to guess the column layout.
    formatted: [o.flat_no, o.street_name, o.landmark, o.area].filter(Boolean).join(', '),
  };
}

async function list(query) {
  const { page, limit, offset, sortBy, sortOrder } = parsePagination(query, {
    sortable: ['id', 'delivery_date', 'total_amount', 'created_at', 'status'],
    defaultSort: 'created_at',
  });
  const filters = {
    status: query.status,
    order_type: query.order_type,
    payment_status: query.payment_status,
    search: query.search,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
  const { rows, total } = await AdminOrder.list({ filters, sortBy, sortOrder, limit, offset });
  return { data: rows.map(shapeRow), page, limit, total };
}

async function getById(id) {
  const o = await AdminOrder.findById(id);
  if (!o) throw new ApiError(404, 'Order not found');

  const subtotal = num(o.total_amount);
  return {
    id: o.id,
    order_number: formatOrderNumber(o.id, o.created_at),
    status: o.status,
    order_type: o.order_type,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    delivery_date: o.delivery_date,
    delivery_shift: o.delivery_shift,
    delivery_slot: o.delivery_slot,
    created_at: o.created_at,
    customer: {
      name: o.customer_name,
      email: o.customer_email || null,
      phone: o.customer_phone || null,
    },
    address: buildAddress(o),
    // Field names match the admin UI's OrderDetail contract exactly.
    items: [
      {
        id: o.id,
        product_name: o.product_name,
        variant_label: o.size_label,
        sku: o.sku,
        quantity: num(o.items_count),
        unit_price: num(o.sale_price),
        total_price: subtotal,
      },
    ],
    subtotal,
    total_amount: num(o.total_amount),
    // Fields with no backing column yet — safe placeholders so the UI renders.
    // (admin_notes, coupon_code, discount, delivery_fee, delivery_logs → DDL handoff.)
    discount: 0,
    delivery_fee: 0,
    coupon_code: null,
    admin_notes: null,
    delivery_logs: [],
  };
}

async function updateStatus(id, status) {
  const affected = await AdminOrder.updateStatus(id, status);
  if (!affected) throw new ApiError(404, 'Order not found');
  // Delivered email (one-time orders only) — fire-and-forget.
  if (status === 'delivered') notifyOrdersDelivered([Number(id)]);
  return { id, status };
}

async function bulkUpdateStatus(ids, status) {
  const affected = await AdminOrder.bulkUpdateStatus(ids, status);
  return { updated: affected, status };
}

module.exports = { list, getById, updateStatus, bulkUpdateStatus };
