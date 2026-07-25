const asyncHandler = require('../middleware/asyncHandler');
const { ok, created, paginated } = require('../utils/apiResponse');
const svc = require('../services/marketingService');

// Coupons
const listCoupons = asyncHandler(async (req, res) => paginated(res, await svc.listCoupons(req.query)));
const getCoupon = asyncHandler(async (req, res) => ok(res, await svc.getCoupon(req.params.id)));
const createCoupon = asyncHandler(async (req, res) =>
  created(res, await svc.createCoupon(req.body, (req.admin && req.admin.uid) || 'admin:open')));
const updateCoupon = asyncHandler(async (req, res) => ok(res, await svc.updateCoupon(req.params.id, req.body)));
const deleteCoupon = asyncHandler(async (req, res) => ok(res, await svc.deleteCoupon(req.params.id)));
const getCouponStats = asyncHandler(async (req, res) => ok(res, await svc.getCouponStats(req.params.id)));

// Banners
const listBanners = asyncHandler(async (req, res) => paginated(res, await svc.listBanners(req.query)));
const createBanner = asyncHandler(async (req, res) => created(res, await svc.createBanner(req.body)));
const updateBanner = asyncHandler(async (req, res) => ok(res, await svc.updateBanner(req.params.id, req.body)));
const deleteBanner = asyncHandler(async (req, res) => ok(res, await svc.deleteBanner(req.params.id)));

// Settings
const getSettings = asyncHandler(async (req, res) => ok(res, await svc.getSettings()));
const updateSettings = asyncHandler(async (req, res) => ok(res, await svc.updateSettings(req.body)));

// Notifications — no provider is wired (WhatsApp/SMS/push are stubs everywhere
// in DairySide). Honest 501 so the UI gets a clear signal, not a silent no-op.
const sendNotification = asyncHandler(async (req, res) => {
  res.status(501).json({ success: false, error: 'No notification provider configured yet' });
});

// Delivery slots
const listSlots = asyncHandler(async (req, res) => ok(res, await svc.listSlots()));
const updateSlot = asyncHandler(async (req, res) => ok(res, await svc.updateSlot(req.params.id, req.body)));

// Contact messages
const listMessages = asyncHandler(async (req, res) => paginated(res, await svc.listMessages(req.query)));
const respondMessage = asyncHandler(async (req, res) => ok(res, await svc.respondMessage(req.params.id, req.body)));

module.exports = {
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponStats,
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getSettings,
  updateSettings,
  sendNotification,
  listSlots,
  updateSlot,
  listMessages,
  respondMessage,
};
