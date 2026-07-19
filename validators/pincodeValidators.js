const Joi = require('joi');

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  is_active: Joi.boolean(),
  search: Joi.string().trim().allow(''),
});

// Only the columns that actually exist on serviceable_pincodes are accepted.
// UI-only fields (delivery_fee, min_order_amount, morning, evening) have no
// backing columns yet (see DDL handoff) and are intentionally not persisted.
const createBody = Joi.object({
  pincode: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({ 'string.pattern.base': 'pincode must be 6 digits' }),
  area_name: Joi.string().trim().max(120).allow(null, ''),
  city: Joi.string().trim().max(80).allow(null, ''),
  state: Joi.string().trim().max(80).allow(null, ''),
  is_active: Joi.boolean().default(true),
  launching_on: Joi.date().iso().allow(null),
});

const updateBody = Joi.object({
  area_name: Joi.string().trim().max(120).allow(null, ''),
  city: Joi.string().trim().max(80).allow(null, ''),
  state: Joi.string().trim().max(80).allow(null, ''),
  is_active: Joi.boolean(),
  launching_on: Joi.date().iso().allow(null),
}).min(1);

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

module.exports = { listQuery, createBody, updateBody, idParam };
