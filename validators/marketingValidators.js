// Validators for coupons, banners, settings, delivery slots, contact messages.
const Joi = require('joi');

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  is_active: Joi.boolean(),
  search: Joi.string().trim().allow(''),
});

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

// ── Coupons ── (discount_type matches the UI: 'flat' | 'percentage')
const couponCreate = Joi.object({
  code: Joi.string().trim().uppercase().min(3).max(40).required(),
  description: Joi.string().trim().max(255).allow(null, ''),
  discount_type: Joi.string().valid('flat', 'percentage').required(),
  discount_value: Joi.number().positive().precision(2).required(),
  min_order_amount: Joi.number().min(0).precision(2).default(0),
  max_discount: Joi.number().positive().precision(2).allow(null),
  usage_limit: Joi.number().integer().positive().allow(null),
  valid_from: Joi.date().iso().allow(null),
  valid_until: Joi.date().iso().allow(null),
  is_active: Joi.boolean().default(true),
});

const couponUpdate = couponCreate.fork(['code', 'discount_type', 'discount_value'], (s) => s.optional()).min(1);

// ── Banners ──
const bannerCreate = Joi.object({
  title: Joi.string().trim().max(150).allow(null, ''),
  image_url: Joi.string().uri().max(500).required(),
  link_url: Joi.string().uri().max(500).allow(null, ''),
  display_order: Joi.number().integer().default(0),
  is_active: Joi.boolean().default(true),
  starts_at: Joi.date().iso().allow(null),
  ends_at: Joi.date().iso().allow(null),
});

const bannerUpdate = bannerCreate.fork(['image_url'], (s) => s.optional()).min(1);

// ── Settings ── accepts { key: value, ... } or [{ key, value }, ...]
const settingsUpdate = Joi.alternatives().try(
  Joi.object().pattern(Joi.string().max(80), Joi.alternatives().try(Joi.string().allow(''), Joi.number(), Joi.boolean())).min(1),
  Joi.array()
    .items(Joi.object({ key: Joi.string().max(80).required(), value: Joi.alternatives().try(Joi.string().allow(''), Joi.number(), Joi.boolean()).required() }).unknown(true))
    .min(1)
);

// ── Delivery slots ──
const slotUpdate = Joi.object({
  label: Joi.string().trim().max(60),
  shift: Joi.string().valid('morning', 'evening'),
  cutoff_time: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow(null),
  is_active: Joi.boolean(),
  display_order: Joi.number().integer(),
}).min(1);

// ── Contact messages ── (status matches the UI: 'pending' | 'resolved')
const messageListQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  status: Joi.string().valid('pending', 'resolved'),
});

const messageRespond = Joi.object({
  admin_response: Joi.string().trim().min(1).max(2000),
  status: Joi.string().valid('pending', 'resolved'),
}).min(1);

module.exports = {
  listQuery,
  idParam,
  couponCreate,
  couponUpdate,
  bannerCreate,
  bannerUpdate,
  settingsUpdate,
  slotUpdate,
  messageListQuery,
  messageRespond,
};
