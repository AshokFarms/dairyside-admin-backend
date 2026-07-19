// Mounted at /v1/admin (so paths below are /products* and /variants*).
const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/catalogController');
const v = require('../validators/catalogValidators');

const router = express.Router();

// Products
router.get('/products', validate(v.productListQuery, 'query'), c.listProducts);
router.post('/products', validate(v.productCreate), c.createProduct);
router.get('/products/:id', validate(v.idParam, 'params'), c.getProduct);
router.put('/products/:id', validate(v.idParam, 'params'), validate(v.productUpdate), c.updateProduct);
router.delete('/products/:id', validate(v.idParam, 'params'), c.deleteProduct);

// Variants
router.post('/products/:productId/variants', validate(v.productIdParam, 'params'), validate(v.variantCreate), c.addVariant);
router.put('/variants/:id', validate(v.idParam, 'params'), validate(v.variantUpdate), c.updateVariant);
router.patch('/variants/:id/stock', validate(v.idParam, 'params'), validate(v.stockUpdate), c.updateStock);

module.exports = router;
