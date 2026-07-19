const Joi = require('joi');

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  is_active: Joi.boolean(),
  search: Joi.string().trim().allow(''),
});

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
  delivery_fee: Joi.number().precision(2).min(0).max(10000),
  min_order_amount: Joi.number().precision(2).min(0).max(100000),
  morning: Joi.boolean(),
  evening: Joi.boolean(),
});

const updateBody = Joi.object({
  area_name: Joi.string().trim().max(120).allow(null, ''),
  city: Joi.string().trim().max(80).allow(null, ''),
  state: Joi.string().trim().max(80).allow(null, ''),
  is_active: Joi.boolean(),
  launching_on: Joi.date().iso().allow(null),
  delivery_fee: Joi.number().precision(2).min(0).max(10000),
  min_order_amount: Joi.number().precision(2).min(0).max(100000),
  morning: Joi.boolean(),
  evening: Joi.boolean(),
}).min(1);

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

module.exports = { listQuery, createBody, updateBody, idParam };
