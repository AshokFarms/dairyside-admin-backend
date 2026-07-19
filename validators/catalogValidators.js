const Joi = require('joi');

const bool = Joi.boolean();

const productListQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
  category_id: Joi.number().integer().positive(),
  is_active: bool,
  is_subscription_eligible: bool,
  search: Joi.string().trim().allow(''),
});

const productCreate = Joi.object({
  name: Joi.string().trim().min(1).max(150).required(),
  slug: Joi.string().trim().min(1).max(150).required(),
  category_id: Joi.number().integer().positive().required(),
  short_description: Joi.string().trim().max(255).allow(null, ''),
  description: Joi.string().allow(null, ''),
  image_url: Joi.string().uri().max(500).allow(null, ''),
  badge: Joi.string().trim().max(50).allow(null, ''),
  is_subscription_eligible: bool.default(false),
  is_featured: bool.default(false),
  is_active: bool.default(true),
  display_order: Joi.number().integer().default(0),
});

const productUpdate = productCreate.fork(
  ['name', 'slug', 'category_id'],
  (s) => s.optional()
).min(1);

const variantCreate = Joi.object({
  sku: Joi.string().trim().min(1).max(50).required(),
  size_label: Joi.string().trim().max(50).allow(null, ''),
  size_value: Joi.number().integer().allow(null),
  size_unit: Joi.string().valid('ml', 'gm', 'kg', 'pcs').required(),
  mrp: Joi.number().precision(2).min(0).required(),
  sale_price: Joi.number().precision(2).min(0).required(),
  stock_quantity: Joi.number().integer().min(0).default(0),
  min_order_quantity: Joi.number().integer().min(1).default(1),
  max_order_quantity: Joi.number().integer().min(1).default(10),
  is_default: bool.default(false),
  is_active: bool.default(true),
});

const variantUpdate = variantCreate.fork(['sku', 'size_unit', 'mrp', 'sale_price'], (s) => s.optional()).min(1);

const stockUpdate = Joi.object({
  stock_quantity: Joi.number().integer().min(0).required(),
});

const categoryListQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  is_active: bool,
});

const categoryCreate = Joi.object({
  name: Joi.string().trim().min(1).max(150).required(),
  slug: Joi.string().trim().min(1).max(150).required(),
  description: Joi.string().allow(null, ''),
  image_url: Joi.string().uri().max(500).allow(null, ''),
  icon_url: Joi.string().uri().max(500).allow(null, ''),
  display_order: Joi.number().integer().default(0),
  is_active: bool.default(true),
  meta_title: Joi.string().trim().max(255).allow(null, ''),
  meta_description: Joi.string().allow(null, ''),
});

const categoryUpdate = categoryCreate.fork(['name', 'slug'], (s) => s.optional()).min(1);

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });
const productIdParam = Joi.object({ productId: Joi.number().integer().positive().required() });

module.exports = {
  productListQuery,
  productCreate,
  productUpdate,
  variantCreate,
  variantUpdate,
  stockUpdate,
  categoryListQuery,
  categoryCreate,
  categoryUpdate,
  idParam,
  productIdParam,
};
