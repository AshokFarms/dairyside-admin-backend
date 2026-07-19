const AdminCatalog = require('../models/adminCatalogModel');
const Category = require('../models/categoryModel'); // existing model is column-correct
const { ApiError } = require('../middleware/errorHandler');
const { parsePagination } = require('../utils/pagination');

const num = (v) => (v === null || v === undefined ? null : Number(v));
const boolify = (o, keys) => {
  const out = { ...o };
  keys.forEach((k) => {
    if (out[k] !== undefined) out[k] = !!out[k];
  });
  return out;
};

// ── Products ──
async function listProducts(query) {
  const { page, limit, offset, sortBy, sortOrder } = parsePagination(query, {
    sortable: ['name', 'created_at', 'display_order', 'id'],
    defaultSort: 'created_at',
  });
  const filters = {
    category_id: query.category_id,
    is_active: query.is_active,
    is_subscription_eligible: query.is_subscription_eligible,
    search: query.search,
  };
  const { rows, total } = await AdminCatalog.listProducts({ filters, sortBy, sortOrder, limit, offset });
  const data = rows.map((p) => ({
    ...boolify(p, ['is_subscription_eligible', 'is_featured', 'is_active']),
    thumbnail: p.image_url, // alias for UIs that render `thumbnail`
    min_price: num(p.min_price),
    max_price: num(p.max_price),
    variants_count: num(p.variants_count),
    stock_total: num(p.stock_total),
  }));
  return { data, page, limit, total };
}

async function getProduct(id) {
  const p = await AdminCatalog.findProductById(id);
  if (!p) throw new ApiError(404, 'Product not found');
  return boolify(p, ['is_subscription_eligible', 'is_featured', 'is_active', 'is_trial_available']);
}

async function createProduct(body) {
  const id = await AdminCatalog.createProduct(body);
  return getProduct(id);
}

async function updateProduct(id, body) {
  const exists = await AdminCatalog.findProductById(id);
  if (!exists) throw new ApiError(404, 'Product not found');
  await AdminCatalog.updateProduct(id, body);
  return getProduct(id);
}

async function deleteProduct(id) {
  const affected = await AdminCatalog.deleteProduct(id);
  if (!affected) throw new ApiError(404, 'Product not found');
  return { id: Number(id) };
}

// ── Variants ──
async function addVariant(productId, body) {
  if (!(await AdminCatalog.productExists(productId))) throw new ApiError(404, 'Product not found');
  const id = await AdminCatalog.createVariant(productId, body);
  return AdminCatalog.findVariantById(id);
}

async function updateVariant(id, body) {
  if (!(await AdminCatalog.findVariantById(id))) throw new ApiError(404, 'Variant not found');
  await AdminCatalog.updateVariant(id, body);
  return AdminCatalog.findVariantById(id);
}

async function updateStock(id, stockQuantity) {
  const affected = await AdminCatalog.updateStock(id, stockQuantity);
  if (!affected) throw new ApiError(404, 'Variant not found');
  return AdminCatalog.findVariantById(id);
}

// ── Categories ──
async function listCategories(query) {
  const { page, limit, offset } = parsePagination(query, { defaultSort: 'display_order' });
  const { rows, total } = await AdminCatalog.listCategories({ isActive: query.is_active, limit, offset });
  return { data: rows.map((c) => boolify(c, ['is_active'])), page, limit, total };
}

async function createCategory(body) {
  const id = await Category.create(body);
  return Category.findById(id);
}

async function updateCategory(id, body) {
  const existing = await Category.findById(id);
  if (!existing) throw new ApiError(404, 'Category not found');
  // Category.update expects a full row; merge partial body over existing values.
  await Category.update(id, { ...existing, ...body });
  return Category.findById(id);
}

async function deleteCategory(id) {
  const existing = await Category.findById(id);
  if (!existing) throw new ApiError(404, 'Category not found');
  await Category.delete(id);
  return { id: Number(id) };
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  addVariant,
  updateVariant,
  updateStock,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
