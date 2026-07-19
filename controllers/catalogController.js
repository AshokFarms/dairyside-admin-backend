const asyncHandler = require('../middleware/asyncHandler');
const { ok, created, paginated } = require('../utils/apiResponse');
const svc = require('../services/catalogService');

// Products
const listProducts = asyncHandler(async (req, res) => paginated(res, await svc.listProducts(req.query)));
const getProduct = asyncHandler(async (req, res) => ok(res, await svc.getProduct(req.params.id)));
const createProduct = asyncHandler(async (req, res) => created(res, await svc.createProduct(req.body)));
const updateProduct = asyncHandler(async (req, res) => ok(res, await svc.updateProduct(req.params.id, req.body)));
const deleteProduct = asyncHandler(async (req, res) => ok(res, await svc.deleteProduct(req.params.id)));

// Variants
const addVariant = asyncHandler(async (req, res) => created(res, await svc.addVariant(req.params.productId, req.body)));
const updateVariant = asyncHandler(async (req, res) => ok(res, await svc.updateVariant(req.params.id, req.body)));
const updateStock = asyncHandler(async (req, res) => ok(res, await svc.updateStock(req.params.id, req.body.stock_quantity)));

// Categories
const listCategories = asyncHandler(async (req, res) => paginated(res, await svc.listCategories(req.query)));
const createCategory = asyncHandler(async (req, res) => created(res, await svc.createCategory(req.body)));
const updateCategory = asyncHandler(async (req, res) => ok(res, await svc.updateCategory(req.params.id, req.body)));
const deleteCategory = asyncHandler(async (req, res) => ok(res, await svc.deleteCategory(req.params.id)));

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
