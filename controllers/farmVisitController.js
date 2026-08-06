const asyncHandler = require('../middleware/asyncHandler');
const { ok, created, paginated } = require('../utils/apiResponse');
const farmVisitService = require('../services/farmVisitService');

// ── Farm ────────────────────────────────────────────────────
const listFarms = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.listFarms());
});

const getFarm = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.getFarm(req.params.farmId));
});

const updateFarm = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.updateFarm(req.params.farmId, req.body));
});

// ── Content sections (blocks | gallery | testimonials | faqs) ──
const listSection = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.listSection(req.params.section, req.params.farmId));
});

const createSectionRow = asyncHandler(async (req, res) => {
  created(res, await farmVisitService.createSectionRow(req.params.section, req.params.farmId, req.body));
});

const updateSectionRow = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.updateSectionRow(req.params.section, req.params.id, req.body));
});

const deleteSectionRow = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.deleteSectionRow(req.params.section, req.params.id));
});

// ── Slots ───────────────────────────────────────────────────
const listSlots = asyncHandler(async (req, res) => {
  paginated(res, await farmVisitService.listSlots(req.params.farmId, req.query));
});

const createSlot = asyncHandler(async (req, res) => {
  created(res, await farmVisitService.createSlot(req.params.farmId, req.body));
});

const bulkGenerateSlots = asyncHandler(async (req, res) => {
  created(res, await farmVisitService.bulkGenerateSlots(req.params.farmId, req.body));
});

const updateSlot = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.updateSlot(req.params.id, req.body));
});

const deleteSlot = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.deleteSlot(req.params.id));
});

// ── Bookings ────────────────────────────────────────────────
const listBookings = asyncHandler(async (req, res) => {
  paginated(res, await farmVisitService.listBookings(req.query));
});

const getBooking = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.getBooking(req.params.id));
});

const updateBookingStatus = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.updateBookingStatus(req.params.id, req.body.status));
});

const bookingStats = asyncHandler(async (req, res) => {
  ok(res, await farmVisitService.bookingStats(req.params.farmId));
});

module.exports = {
  listFarms, getFarm, updateFarm,
  listSection, createSectionRow, updateSectionRow, deleteSectionRow,
  listSlots, createSlot, bulkGenerateSlots, updateSlot, deleteSlot,
  listBookings, getBooking, updateBookingStatus, bookingStats,
};
