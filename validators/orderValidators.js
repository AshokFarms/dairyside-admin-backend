const Joi = require('joi');

// Real DB enums (extended to include processing, out_for_delivery, and returned)
const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
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
