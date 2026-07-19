const Joi = require('joi');

// Real DB enums (docker/initdb/00-schema.sql). The admin UI also shows
// 'processing' / 'out_for_delivery' and a 'trial' type, which are NOT storable
// until the enums are extended (see DDL handoff) — so writes validate against
// the real set and reject the rest with a clear 400.
const ORDER_STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'];
const ORDER_TYPES = ['one_time', 'subscription_delivery'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
  status: Joi.string().valid(...ORDER_STATUSES),
  order_type: Joi.string().valid(...ORDER_TYPES),
  payment_status: Joi.string().valid(...PAYMENT_STATUSES),
  search: Joi.string().trim().allow(''),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
});

const statusUpdate = Joi.object({
  status: Joi.string()
    .valid(...ORDER_STATUSES)
    .required(),
});

const bulkStatus = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(200).required(),
  status: Joi.string()
    .valid(...ORDER_STATUSES)
    .required(),
});

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

module.exports = { listQuery, statusUpdate, bulkStatus, idParam, ORDER_STATUSES, ORDER_TYPES, PAYMENT_STATUSES };
