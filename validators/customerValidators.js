const Joi = require('joi');

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
  search: Joi.string().trim().allow(''),
});

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

const listSubQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

// Manual wallet adjustment by an admin. `type` decides credit vs debit; amount
// is always positive. reason is stored as the transaction description.
const walletAdjust = Joi.object({
  type: Joi.string().valid('credit', 'debit').required(),
  amount: Joi.number().positive().precision(2).max(100000).required(),
  reason: Joi.string().trim().min(1).max(500).required(),
});

module.exports = { listQuery, idParam, listSubQuery, walletAdjust };
