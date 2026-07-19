const Category = require('../models/categoryModel');

// Helper to generate slug if missing
const generateSlug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public 
const getAllCategories = async (req, res, next) => {
  try {
    const { is_active } = req.query;
    const categories = await Category.findAll(is_active);
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Public
const getCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Private
const createCategory = async (req, res, next) => {
  try {
    let { name, slug, description, image_url, icon_url, display_order, is_active, meta_title, meta_description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Please add a category name' });
    }

    if (!slug) {
      slug = generateSlug(name);
    }

    const newCategoryData = { name, slug, description, image_url, icon_url, display_order, is_active, meta_title, meta_description };
    const insertId = await Category.create(newCategoryData);
    
    // Fetch newly created
    const createdCategory = await Category.findById(insertId);

    res.status(201).json({
      success: true,
      data: createdCategory
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Category name or slug already exists' });
    }
    next(error);
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { name, slug, description, image_url, icon_url, display_order, is_active, meta_title, meta_description } = req.body;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    if (!slug && name) {
      slug = generateSlug(name);
    } else if (!slug && !name) {
        slug = existingCategory.slug;
    }

    const updatedData = { 
        name: name || existingCategory.name, 
        slug: slug, 
        description: description !== undefined ? description : existingCategory.description, 
        image_url: image_url !== undefined ? image_url : existingCategory.image_url, 
        icon_url: icon_url !== undefined ? icon_url : existingCategory.icon_url, 
        display_order: display_order !== undefined ? display_order : existingCategory.display_order, 
        is_active: is_active !== undefined ? is_active : existingCategory.is_active, 
        meta_title: meta_title !== undefined ? meta_title : existingCategory.meta_title, 
        meta_description: meta_description !== undefined ? meta_description : existingCategory.meta_description 
    };

    await Category.update(id, updatedData);
    
    const updatedCategory = await Category.findById(id);

    res.status(200).json({
      success: true,
      data: updatedCategory
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    await Category.delete(id);
    
    res.status(200).json({
      success: true,
      data: { id: Number(id) }
    });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
         return res.status(400).json({ success: false, error: 'Cannot delete category that still has products assigned to it.' });
    }
    next(error);
  }
};

module.exports = {
  getAllCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
};
