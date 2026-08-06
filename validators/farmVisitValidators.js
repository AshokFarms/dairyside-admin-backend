const Joi = require('joi');

// HH:MM or HH:MM:SS — MySQL TIME accepts both; we normalise to seconds below.
const TIME = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).messages({
  'string.pattern.base': 'time must be HH:MM or HH:MM:SS (24-hour)',
});

const DATE = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({
  'string.pattern.base': 'date must be YYYY-MM-DD',
});

// Images may be a full URL (Cloudinary, a CDN) OR a root-relative path to a
// file the app serves itself from public/ — e.g. '/farm/pasture.jpg'.
// Joi's plain .uri() rejects the second form, which locked out self-hosted
// images entirely. allowRelative fixes that without loosening it to any string.
const IMAGE_URL = Joi.string().uri({ allowRelative: true }).max(500);

const VISIT_TYPE = Joi.string().valid('GENERAL', 'SCHOOL_GROUP', 'PRIVATE');
const SLOT_STATUS = Joi.string().valid('OPEN', 'CLOSED', 'CANCELLED');
const BOOKING_STATUS = Joi.string().valid('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

const farmIdParam = Joi.object({ farmId: Joi.number().integer().positive().required() });

const sectionParams = Joi.object({
  farmId: Joi.number().integer().positive().required(),
  section: Joi.string().valid('blocks', 'gallery', 'testimonials', 'faqs').required(),
});

const sectionRowParams = Joi.object({
  section: Joi.string().valid('blocks', 'gallery', 'testimonials', 'faqs').required(),
  id: Joi.number().integer().positive().required(),
});

// ── Farm ────────────────────────────────────────────────────
const updateFarmBody = Joi.object({
  name: Joi.string().trim().max(160),
  tagline: Joi.string().trim().max(255).allow(null, ''),
  story: Joi.string().allow(null, ''),
  mission: Joi.string().allow(null, ''),
  address_line1: Joi.string().trim().max(255).allow(null, ''),
  address_line2: Joi.string().trim().max(255).allow(null, ''),
  city: Joi.string().trim().max(120).allow(null, ''),
  state: Joi.string().trim().max(120).allow(null, ''),
  pincode: Joi.string().trim().max(10).allow(null, ''),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  contact_phone: Joi.string().trim().max(20).allow(null, ''),
  contact_email: Joi.string().email().max(255).allow(null, ''),
  whatsapp_number: Joi.string().trim().max(20).allow(null, ''),
  hero_image_url: IMAGE_URL.allow(null, ''),
  is_active: Joi.boolean(),
  display_order: Joi.number().integer().min(0),
}).min(1);

// ── Content sections ────────────────────────────────────────
// One permissive schema across the four sections: each table ignores the keys
// that are not its own columns, and requiring four near-identical schemas was
// more surface than the difference justifies. `.min(1)` on update stops an
// empty PUT silently succeeding.
const sectionRowBody = Joi.object({
  // blocks
  block_type: Joi.string().valid('benefit', 'timeline_step', 'practice', 'certification', 'guideline'),
  title: Joi.string().trim().max(200),
  body: Joi.string().allow(null, ''),
  icon: Joi.string().trim().max(64).allow(null, ''),
  image_url: IMAGE_URL.allow(null, ''),
  meta: Joi.object().allow(null),

  // gallery
  thumbnail_url: IMAGE_URL.allow(null, ''),
  // Required at the DB level and enforced here too, so the failure is a clean
  // 400 with a useful message rather than a driver error.
  alt_text: Joi.string().trim().max(300).allow(''),
  caption: Joi.string().trim().max(300).allow(null, ''),
  media_type: Joi.string().valid('image', 'video'),

  // testimonials
  author_name: Joi.string().trim().max(160),
  author_location: Joi.string().trim().max(160).allow(null, ''),
  rating: Joi.number().integer().min(1).max(5).allow(null),
  quote: Joi.string(),
  avatar_url: IMAGE_URL.allow(null, ''),
  visited_on: DATE.allow(null),

  // faqs
  question: Joi.string().trim().max(300),
  answer: Joi.string(),
  category: Joi.string().trim().max(64).allow(null, ''),

  // shared
  display_order: Joi.number().integer().min(0),
  is_active: Joi.boolean(),
  is_published: Joi.boolean(),
}).min(1);

// ── Slots ───────────────────────────────────────────────────
const slotListQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  from: DATE,
  to: DATE,
  status: SLOT_STATUS,
  visit_type: VISIT_TYPE,
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc'),
});

const createSlotBody = Joi.object({
  visit_date: DATE.required(),
  start_time: TIME.required(),
  end_time: TIME.required(),
  visit_type: VISIT_TYPE.default('GENERAL'),
  capacity: Joi.number().integer().min(1).max(500).required(),
  price_per_adult: Joi.number().precision(2).min(0).max(100000).default(0),
  price_per_child: Joi.number().precision(2).min(0).max(100000).default(0),
  status: SLOT_STATUS.default('OPEN'),
  notes: Joi.string().trim().max(500).allow(null, ''),
});

// capacity is intentionally allowed to change; the service refuses to take it
// below seats_booked and explains why.
const updateSlotBody = Joi.object({
  visit_date: DATE,
  start_time: TIME,
  end_time: TIME,
  visit_type: VISIT_TYPE,
  capacity: Joi.number().integer().min(1).max(500),
  price_per_adult: Joi.number().precision(2).min(0).max(100000),
  price_per_child: Joi.number().precision(2).min(0).max(100000),
  status: SLOT_STATUS,
  notes: Joi.string().trim().max(500).allow(null, ''),
}).min(1);

const bulkGenerateBody = Joi.object({
  from: DATE.required(),
  to: DATE.required(),
  // Bounded so one request cannot try to write a decade of slots.
  templates: Joi.array()
    .items(
      Joi.object({
        start_time: TIME.required(),
        end_time: TIME.required(),
        visit_type: VISIT_TYPE.default('GENERAL'),
        capacity: Joi.number().integer().min(1).max(500).required(),
        price_per_adult: Joi.number().precision(2).min(0).max(100000).default(0),
        price_per_child: Joi.number().precision(2).min(0).max(100000).default(0),
      })
    )
    .min(1)
    .max(10)
    .required(),
  // 0 = Sunday … 6 = Saturday
  skip_weekdays: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7).default([]),
}).custom((value, helpers) => {
  if (value.to < value.from) return helpers.message('"to" must not be before "from"');
  const days = (new Date(`${value.to}T00:00:00Z`) - new Date(`${value.from}T00:00:00Z`)) / 86400000;
  if (days > 365) return helpers.message('Generate at most one year of slots at a time');
  return value;
});

// ── Bookings ────────────────────────────────────────────────
const bookingListQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  farm_id: Joi.number().integer().positive(),
  status: BOOKING_STATUS,
  from: DATE,
  to: DATE,
  search: Joi.string().trim().max(120).allow(''),
  sortBy: Joi.string().valid('created_at', 'visit_date', 'status', 'seats'),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc'),
});

const bookingStatusBody = Joi.object({
  status: BOOKING_STATUS.required(),
});

module.exports = {
  idParam, farmIdParam, sectionParams, sectionRowParams,
  updateFarmBody, sectionRowBody,
  slotListQuery, createSlotBody, updateSlotBody, bulkGenerateBody,
  bookingListQuery, bookingStatusBody,
};
