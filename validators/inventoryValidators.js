const Joi = require('joi');

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

const restock = Joi.object({
  qty: Joi.number().integer().positive().required(),
  note: Joi.string().trim().max(255).allow('', null),
});

const adjust = Joi.object({
  delta: Joi.number().integer().invalid(0).required(),
  reason: Joi.string().valid('ADJUSTMENT', 'DAMAGE').default('ADJUSTMENT'),
  note: Joi.string().trim().min(1).max(255).required(),
});

const threshold = Joi.object({
  // null (or omitted) restores the global default.
  threshold: Joi.number().integer().min(0).allow(null),
});

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
  variant_id: Joi.number().integer().positive(),
  reason: Joi.string().valid('SALE', 'CANCEL', 'RESTOCK', 'ADJUSTMENT', 'DAMAGE'),
  search: Joi.string().trim().allow(''),
});

module.exports = { idParam, restock, adjust, threshold, listQuery };
