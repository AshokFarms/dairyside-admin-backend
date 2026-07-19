const Joi = require('joi');

// subscriptions.status enum (schema): active | paused | cancelled | completed
const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled', 'completed'];

const listQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
  status: Joi.string().valid(...SUBSCRIPTION_STATUSES),
  frequency: Joi.string().trim(),
  search: Joi.string().trim().allow(''),
});

const statusUpdate = Joi.object({
  status: Joi.string()
    .valid(...SUBSCRIPTION_STATUSES)
    .required(),
});

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

const trialListQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  status: Joi.string().valid('claimed', 'scheduled', 'delivered', 'cancelled'),
});

module.exports = { listQuery, statusUpdate, idParam, trialListQuery, SUBSCRIPTION_STATUSES };
