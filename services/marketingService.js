const AdminMarketing = require('../models/adminMarketingModel');
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');

const num = (v) => (v === null || v === undefined ? null : Number(v));

// ── Settings catalog ──
// Metadata (description/type/default) is static server-side truth; only VALUES
// live in app_settings. GET merges stored values over these defaults, so the
// settings page always shows the full known set.
const SETTINGS_CATALOG = [
  { key: 'free_delivery_threshold', default: '200', description: 'Minimum order amount for free delivery (₹)', type: 'number' },
  { key: 'delivery_fee', default: '20', description: 'Default delivery fee (₹)', type: 'number' },
  { key: 'gst_percentage', default: '5', description: 'GST percentage applied to orders', type: 'number' },
  { key: 'max_wallet_balance', default: '5000', description: 'Maximum wallet balance a user can hold (₹)', type: 'number' },
  { key: 'referral_bonus', default: '50', description: 'Referral bonus amount (₹)', type: 'number' },
  { key: 'trial_refund_days', default: '7', description: 'Days within which trial refunds are processed', type: 'number' },
  { key: 'support_email', default: 'support@dairyside.in', description: 'Customer support email', type: 'text' },
  { key: 'support_phone', default: '', description: 'Customer support phone', type: 'text' },
  { key: 'order_prefix', default: 'SWD', description: 'Order number prefix', type: 'text' },
  { key: 'maintenance_mode', default: 'false', description: 'Enable maintenance mode (disables ordering)', type: 'boolean' },
];
const KNOWN_KEYS = new Set(SETTINGS_CATALOG.map((s) => s.key));

// ── Coupons ──
function shapeCoupon(c) {
  return {
    ...c,
    discount_value: num(c.discount_value),
    min_order_amount: num(c.min_order_amount),
    max_discount: num(c.max_discount),
    is_active: !!c.is_active,
  };
}

async function listCoupons(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'created_at' });
  const { rows, total } = await AdminMarketing.listCoupons({
    isActive: query.is_active,
    search: query.search,
    limit,
    offset,
  });
  return { data: rows.map(shapeCoupon), page, limit, total };
}

async function getCoupon(id) {
  const c = await AdminMarketing.findCoupon(id);
  if (!c) throw new ApiError(404, 'Coupon not found');
  return shapeCoupon(c);
}

async function createCoupon(body) {
  const existing = await AdminMarketing.listCoupons({ search: body.code, limit: 1, offset: 0 });
  if (existing.rows.some((r) => r.code === body.code)) {
    throw new ApiError(409, `Coupon code '${body.code}' already exists`);
  }
  const id = await AdminMarketing.createCoupon(body);
  return getCoupon(id);
}

async function updateCoupon(id, body) {
  if (!(await AdminMarketing.findCoupon(id))) throw new ApiError(404, 'Coupon not found');
  await AdminMarketing.updateCoupon(id, body);
  return getCoupon(id);
}

async function deleteCoupon(id) {
  const affected = await AdminMarketing.deleteCoupon(id);
  if (!affected) throw new ApiError(404, 'Coupon not found');
  return { id: Number(id) };
}

// ── Banners ──
const shapeBanner = (b) => ({ ...b, is_active: !!b.is_active });

async function listBanners(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'display_order' });
  const { rows, total } = await AdminMarketing.listBanners({ isActive: query.is_active, limit, offset });
  return { data: rows.map(shapeBanner), page, limit, total };
}

async function createBanner(body) {
  const id = await AdminMarketing.createBanner(body);
  return shapeBanner(await AdminMarketing.findBanner(id));
}

async function updateBanner(id, body) {
  if (!(await AdminMarketing.findBanner(id))) throw new ApiError(404, 'Banner not found');
  await AdminMarketing.updateBanner(id, body);
  return shapeBanner(await AdminMarketing.findBanner(id));
}

async function deleteBanner(id) {
  const affected = await AdminMarketing.deleteBanner(id);
  if (!affected) throw new ApiError(404, 'Banner not found');
  return { id: Number(id) };
}

// ── Settings ──
async function getSettings() {
  const stored = await AdminMarketing.getSettings();
  const valueOf = new Map(stored.map((s) => [s.setting_key, s.setting_value]));
  return SETTINGS_CATALOG.map((s) => ({
    key: s.key,
    value: valueOf.has(s.key) ? valueOf.get(s.key) : s.default,
    description: s.description,
    type: s.type,
  }));
}

async function updateSettings(body) {
  // Accept { key: value } map or [{ key, value }] array (the UI sends its rows).
  const entries = Array.isArray(body)
    ? body.map((s) => [s.key, s.value])
    : Object.entries(body);

  const unknown = entries.filter(([k]) => !KNOWN_KEYS.has(k)).map(([k]) => k);
  if (unknown.length) throw new ApiError(400, `Unknown setting keys: ${unknown.join(', ')}`);

  for (const [key, value] of entries) {
    await AdminMarketing.upsertSetting(key, String(value));
  }
  return getSettings();
}

// ── Delivery slots ──
const shapeSlot = (s) => ({ ...s, is_active: !!s.is_active });

async function listSlots() {
  return (await AdminMarketing.listSlots()).map(shapeSlot);
}

async function updateSlot(id, body) {
  if (!(await AdminMarketing.findSlot(id))) throw new ApiError(404, 'Delivery slot not found');
  await AdminMarketing.updateSlot(id, body);
  return shapeSlot(await AdminMarketing.findSlot(id));
}

// ── Contact messages ──
async function listMessages(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'created_at' });
  const { rows, total } = await AdminMarketing.listMessages({ status: query.status, limit, offset });
  return { data: rows, page, limit, total };
}

async function respondMessage(id, body) {
  if (!(await AdminMarketing.findMessage(id))) throw new ApiError(404, 'Message not found');
  await AdminMarketing.respondMessage(id, body);
  return AdminMarketing.findMessage(id);
}

module.exports = {
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getSettings,
  updateSettings,
  listSlots,
  updateSlot,
  listMessages,
  respondMessage,
};
