// Validators for coupons, banners, settings, delivery slots, contact messages.
const Joi = require('joi');

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  is_active: Joi.boolean(), // legacy alias for status active/paused
  status: Joi.string().valid('draft', 'active', 'paused', 'expired'),
  search: Joi.string().trim().allow(''),
});

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

// ── Coupons ── (discount_type matches the UI: 'flat' | 'percentage'; the DB
// ENUM is ('flat','percent','free_delivery') and marketingService maps between)
//
// Create and update are built from ONE field map rather than forking one out of
// the other. A partial update must not carry create's defaults — a PATCH of
// { status } would otherwise silently reset visibility, per_user_limit and the
// rest to their defaults. Joi has no way to remove a default once set
// (`.default(undefined)` throws "Missing default value"), so the shared map
// below carries no defaults and create adds them explicitly.
const couponFields = {
  code: Joi.string().trim().uppercase().min(3).max(40),
  description: Joi.string().trim().max(255).allow(null, ''),
  discount_type: Joi.string().valid('flat', 'percentage', 'free_delivery'),
  // A percentage over 100 would invert the total; flat values are capped by the
  // subtotal at redemption time, not here.
  discount_value: Joi.number().positive().precision(2)
    .when('discount_type', { is: 'percentage', then: Joi.number().max(100) }),
  min_order_amount: Joi.number().min(0).precision(2),
  // Required on percentage coupons, not merely advised: an uncapped "20% off"
  // costs whatever the largest basket happens to be. This is the one rule that
  // separates a campaign with a known worst case from an open cheque.
  max_discount: Joi.number().positive().precision(2).allow(null)
    .when('discount_type', {
      is: 'percentage',
      then: Joi.number().positive().precision(2).required()
        .messages({ 'any.required': 'A percentage coupon must set max_discount — an uncapped percentage has no worst case.' }),
    }),
  usage_limit: Joi.number().integer().positive().allow(null),
  per_user_limit: Joi.number().integer().positive().allow(null),
  first_order_only: Joi.boolean(),
  applies_to: Joi.string().valid('one_time', 'subscription', 'both'),
  visibility: Joi.string().valid('public', 'private'),
  valid_from: Joi.date().iso(),
  valid_until: Joi.date().iso(),
  status: Joi.string().valid('draft', 'active', 'paused', 'expired'),
  // Legacy alias — the coupon list's activate/pause toggle sends this.
  // marketingService maps it onto status.
  is_active: Joi.boolean(),
};

const validityWindow = (v, helpers) => {
  if (v.valid_from && v.valid_until && new Date(v.valid_until) <= new Date(v.valid_from)) {
    return helpers.message('valid_until must be after valid_from');
  }
  return v;
};

const couponCreate = Joi.object({
  ...couponFields,
  code: couponFields.code.required(),
  discount_type: couponFields.discount_type.required(),
  discount_value: couponFields.discount_value.required(),
  min_order_amount: couponFields.min_order_amount.default(0),
  per_user_limit: couponFields.per_user_limit.default(1),
  first_order_only: couponFields.first_order_only.default(false),
  applies_to: couponFields.applies_to.default('one_time'),
  visibility: couponFields.visibility.default('private'),
  // Required on create so every campaign has a deliberate window. The columns
  // stay nullable for the rows that predate this migration.
  valid_from: couponFields.valid_from.required(),
  valid_until: couponFields.valid_until.required(),
  // New coupons land in 'draft' so a campaign can be reviewed before it can be
  // redeemed. Going live is an explicit PUT.
  status: couponFields.status.default('draft'),
}).custom(validityWindow);

// Every field optional, no defaults. `.min(1)` guards an empty PATCH body.
// marketingService re-checks the ≤100 percentage rule and the window against the
// MERGED row, which is what catches a patch that omits discount_type.
const couponUpdate = Joi.object(couponFields).min(1).custom(validityWindow);

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
