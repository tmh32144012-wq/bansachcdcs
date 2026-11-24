const { sql, getPool } = require('../config/db');

/**
 * GET /api/categories
 * Lấy toàn bộ danh mục sách kèm số lượng sách trong từng danh mục
 */
const getCategories = async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        c.CategoryID,
        c.CategoryName,
        c.ParentID,
        p.CategoryName AS ParentName,
        COUNT(bc.BookID) AS BookCount
      FROM dbo.Categories c
      LEFT JOIN dbo.Categories p ON c.ParentID = p.CategoryID
      LEFT JOIN dbo.BookCategories bc ON c.CategoryID = bc.CategoryID
      GROUP BY c.CategoryID, c.CategoryName, c.ParentID, p.CategoryName
      ORDER BY c.CategoryID ASC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/categories (Admin)
 */
const createCategory = async (req, res, next) => {
  try {
    const { categoryName, parentId } = req.body;
    if (!categoryName || !categoryName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên danh mục không được để trống.',
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('CategoryName', sql.NVarChar(100), categoryName.trim())
      .input('ParentID', sql.Int, parentId ? parseInt(parentId, 10) : null)
      .query(`
        INSERT INTO dbo.Categories (CategoryName, ParentID)
        OUTPUT INSERTED.*
        VALUES (@CategoryName, @ParentID)
      `);

    res.status(201).json({
      success: true,
      message: 'Tạo danh mục thành công.',
      data: result.recordset[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/categories/:id (Admin)
 */
const updateCategory = async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const { categoryName, parentId } = req.body;

    if (!categoryName || !categoryName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên danh mục không được để trống.',
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('CategoryID', sql.Int, categoryId)
      .input('CategoryName', sql.NVarChar(100), categoryName.trim())
      .input('ParentID', sql.Int, parentId ? parseInt(parentId, 10) : null)
      .query(`
        UPDATE dbo.Categories
        SET CategoryName = @CategoryName, ParentID = @ParentID
        OUTPUT INSERTED.*
        WHERE CategoryID = @CategoryID
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy danh mục.',
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật danh mục thành công.',
      data: result.recordset[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/categories/:id (Admin)
 */
const deleteCategory = async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const result = await pool
      .request()
      .input('CategoryID', sql.Int, categoryId)
      .query('DELETE FROM dbo.Categories WHERE CategoryID = @CategoryID');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy danh mục cần xóa.',
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa danh mục thành công.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};

