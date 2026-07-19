const Joi = require('joi');

const todayQuery = Joi.object({
  date: Joi.date().iso(), // optional override; defaults to today (IST)
  shift: Joi.string().valid('morning', 'evening'),
});

const idParam = Joi.object({ orderId: Joi.number().integer().positive().required() });

const bulkComplete = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(500).required(),
});

module.exports = { todayQuery, idParam, bulkComplete };
