const Joi = require('joi');

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
  actor: Joi.string().trim().max(150).allow(''),
  action: Joi.string().trim().max(50),
  entityType: Joi.string().trim().max(50),
  entityId: Joi.string().trim().max(64),
  source: Joi.string().valid('customer-app', 'admin-panel', 'system'),
  success: Joi.boolean(),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  search: Joi.string().trim().max(120).allow(''),
});

const entityParams = Joi.object({
  type: Joi.string().trim().max(50).required(),
  id: Joi.string().trim().max(64).required(),
});

const entityQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

// Deletion must name what it removes: either an explicit id list (capped so one
// request cannot wipe the table) or an age cutoff. `xor` rejects both-or-neither,
// which is what stops an empty body from meaning "delete everything".
const deleteBody = Joi.object({
  ids: Joi.array().items(Joi.number().integer().min(1)).min(1).max(500),
  olderThanDays: Joi.number().integer().min(1).max(3650),
}).xor('ids', 'olderThanDays');

const idParam = Joi.object({
  id: Joi.number().integer().min(1).required(),
});

module.exports = { listQuery, entityParams, entityQuery, deleteBody, idParam };
