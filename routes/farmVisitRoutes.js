const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/farmVisitController');
const v = require('../validators/farmVisitValidators');

const router = express.Router();

// ============================================================
//  /v1/admin/farm-visit
//  Mounted behind adminGuard by routes/index.js, so every route here already
//  requires an allowlisted admin — there is no per-route auth to forget.
// ============================================================

// ── Bookings ──
// Registered FIRST: '/bookings' would otherwise be captured by the
// '/:farmId' patterns below and parsed as a farm id.
router.get('/bookings', validate(v.bookingListQuery, 'query'), c.listBookings);
router.get('/bookings/:id', validate(v.idParam, 'params'), c.getBooking);
router.patch(
  '/bookings/:id/status',
  validate(v.idParam, 'params'),
  validate(v.bookingStatusBody),
  c.updateBookingStatus
);

// ── Slots (by id) ──
// Same reasoning: a literal segment before the '/:farmId' routes.
router.put('/slots/:id', validate(v.idParam, 'params'), validate(v.updateSlotBody), c.updateSlot);
router.delete('/slots/:id', validate(v.idParam, 'params'), c.deleteSlot);

// ── Content rows (by id) ──
router.put(
  '/content/:section/:id',
  validate(v.sectionRowParams, 'params'),
  validate(v.sectionRowBody),
  c.updateSectionRow
);
router.delete('/content/:section/:id', validate(v.sectionRowParams, 'params'), c.deleteSectionRow);

// ── Farms ──
router.get('/farms', c.listFarms);
router.get('/farms/:farmId', validate(v.farmIdParam, 'params'), c.getFarm);
router.put('/farms/:farmId', validate(v.farmIdParam, 'params'), validate(v.updateFarmBody), c.updateFarm);

// ── Per-farm collections ──
router.get('/farms/:farmId/content/:section', validate(v.sectionParams, 'params'), c.listSection);
router.post(
  '/farms/:farmId/content/:section',
  validate(v.sectionParams, 'params'),
  validate(v.sectionRowBody),
  c.createSectionRow
);

router.get('/farms/:farmId/slots', validate(v.farmIdParam, 'params'), validate(v.slotListQuery, 'query'), c.listSlots);
router.post('/farms/:farmId/slots', validate(v.farmIdParam, 'params'), validate(v.createSlotBody), c.createSlot);
router.post(
  '/farms/:farmId/slots/generate',
  validate(v.farmIdParam, 'params'),
  validate(v.bulkGenerateBody),
  c.bulkGenerateSlots
);

router.get('/farms/:farmId/booking-stats', validate(v.farmIdParam, 'params'), c.bookingStats);

module.exports = router;
