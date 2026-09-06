const pool = require('../config/db');

// GET /api/categories
async function getCategories(req, res) {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    return res.status(200).json({ categories: result.rows });
  } catch (err) {
    console.error('Get categories error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// POST /api/categories  (admin/staff only)
async function createCategory(req, res) {
  try {
    const { name, type } = req.body;
    if (!name || !type) {
      return res.status(400).json({ message: 'name and type are required.' });
    }

    const result = await pool.query(
      'INSERT INTO categories (name, type) VALUES ($1, $2) RETURNING *',
      [name, type]
    );

    return res.status(201).json({ message: 'Category created.', category: result.rows[0] });
  } catch (err) {
    console.error('Create category error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// PUT /api/categories/:id  (admin/staff only)
async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, type } = req.body;

    const result = await pool.query(
      `UPDATE categories SET name = COALESCE($1, name), type = COALESCE($2, type)
       WHERE id = $3 RETURNING *`,
      [name, type, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found.' });
    }

    return res.status(200).json({ message: 'Category updated.', category: result.rows[0] });
  } catch (err) {
    console.error('Update category error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

// DELETE /api/categories/:id  (admin/staff only)
async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found.' });
    }

    return res.status(200).json({ message: 'Category deleted.' });
  } catch (err) {
    // Postgres error 23503 = foreign key violation (activities still reference this category)
    if (err.code === '23503') {
      return res.status(409).json({ message: 'Cannot delete a category that still has activities linked to it.' });
    }
    console.error('Delete category error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
