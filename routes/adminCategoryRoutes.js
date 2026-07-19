// Mounted at /v1/admin/categories.
const express = require('express');
const validate = require('../middleware/validate');
const c = require('../controllers/catalogController');
const v = require('../validators/catalogValidators');

const router = express.Router();

router.get('/', validate(v.categoryListQuery, 'query'), c.listCategories);
router.post('/', validate(v.categoryCreate), c.createCategory);
router.put('/:id', validate(v.idParam, 'params'), validate(v.categoryUpdate), c.updateCategory);
router.delete('/:id', validate(v.idParam, 'params'), c.deleteCategory);

module.exports = router;
