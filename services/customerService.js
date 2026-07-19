const AdminCustomer = require('../models/adminCustomerModel');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');
const { formatOrderNumber } = require('../utils/orderNumber');

const num = (v) => Number(v || 0);

function shapeCustomer(c) {
  return {
    id: c.id,
    uid: c.uid,
    name: c.name,
    email: c.email,
    phone: c.phone || null,
    email_verified: !!c.email_verified,
    wallet_balance: num(c.wallet_balance),
    total_orders: num(c.total_orders),
    active_subscriptions: num(c.active_subscriptions),
    created_at: c.created_at,
  };
}

async function list(query) {
  const { page, limit, offset, sortBy, sortOrder } = parsePagination(query, {
    sortable: ['created_at', 'name', 'id'],
    defaultSort: 'created_at',
  });
  const { rows, total } = await AdminCustomer.list({ search: query.search, sortBy, sortOrder, limit, offset });
  return { data: rows.map(shapeCustomer), page, limit, total };
}

async function getById(id) {
  const c = await AdminCustomer.findById(id);
  if (!c) throw new ApiError(404, 'Customer not found');
  return { ...shapeCustomer(c), provider: c.provider, last_login: c.last_login };
}

// Resolve uid or 404 — shared by the uid-keyed sub-resources.
async function resolveUid(id) {
  const uid = await AdminCustomer.uidOf(id);
  if (!uid) throw new ApiError(404, 'Customer not found');
  return uid;
}

async function getOrders(id, query) {
  const uid = await resolveUid(id);
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'created_at' });
  const { rows, total } = await AdminCustomer.ordersOf(uid, { limit, offset });
  const data = rows.map((o) => ({
    id: o.id,
    order_number: formatOrderNumber(o.id, o.created_at),
    product_name: o.product_name,
    size_label: o.size_label,
    items_count: num(o.items_count),
    total_amount: num(o.total_amount),
    status: o.status,
    order_type: o.order_type,
    payment_status: o.payment_status,
    delivery_date: o.delivery_date,
    created_at: o.created_at,
  }));
  return { data, page, limit, total };
}

async function getSubscriptions(id) {
  const uid = await resolveUid(id);
  const rows = await AdminCustomer.subscriptionsOf(uid);
  return rows.map((s) => ({
    id: s.id,
    status: s.status,
    frequency: s.frequency,
    quantity: num(s.quantity),
    delivery_slot: s.delivery_slot,
    product_name: s.product_name,
    size_label: s.size_label,
    price_per_delivery: num(s.sale_price) * num(s.quantity),
    start_date: s.start_date,
    end_date: s.end_date,
    created_at: s.created_at,
  }));
}

async function getWallet(id, query) {
  const uid = await resolveUid(id);
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'created_at' });
  const [balance, tx] = await Promise.all([
    AdminCustomer.walletBalance(uid),
    AdminCustomer.walletTransactions(uid, { limit, offset }),
  ]);
  return {
    balance,
    transactions: tx.rows.map((t) => ({
      id: t.id,
      type: t.type,
      amount: num(t.amount),
      balance_before: num(t.balance_before),
      balance_after: num(t.balance_after),
      reference_type: t.reference_type,
      reference_id: t.reference_id,
      description: t.description,
      created_at: t.created_at,
    })),
    pagination: { page, limit, total: tx.total, totalPages: limit > 0 ? Math.ceil(tx.total / limit) : 0 },
  };
}

async function adjustWallet(id, body) {
  const uid = await resolveUid(id);
  return AdminCustomer.adjustWallet(uid, body);
}

module.exports = { list, getById, getOrders, getSubscriptions, getWallet, adjustWallet };
