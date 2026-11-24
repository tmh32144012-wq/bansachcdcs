const { sql, getPool } = require('../config/db');

/**
 * GET /api/authors
 * Lấy danh sách tất cả tác giả
 */
const getAuthors = async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        a.AuthorID,
        a.AuthorName,
        a.Bio,
        COUNT(ba.BookID) AS BookCount
      FROM dbo.Authors a
      LEFT JOIN dbo.BookAuthors ba ON a.AuthorID = ba.AuthorID
      GROUP BY a.AuthorID, a.AuthorName, a.Bio
      ORDER BY a.AuthorName ASC
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
 * POST /api/authors (Admin)
 */
const createAuthor = async (req, res, next) => {
  try {
    const { authorName, bio } = req.body;
    if (!authorName || !authorName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên tác giả không được để trống.',
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('AuthorName', sql.NVarChar(150), authorName.trim())
      .input('Bio', sql.NVarChar(sql.MAX), bio || null)
      .query(`
        INSERT INTO dbo.Authors (AuthorName, Bio)
        OUTPUT INSERTED.*
        VALUES (@AuthorName, @Bio)
      `);

    res.status(201).json({
      success: true,
      message: 'Thêm tác giả thành công.',
      data: result.recordset[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/authors/:id (Admin)
 */
const updateAuthor = async (req, res, next) => {
  try {
    const authorId = parseInt(req.params.id, 10);
    const { authorName, bio } = req.body;

    if (!authorName || !authorName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên tác giả không được để trống.',
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('AuthorID', sql.Int, authorId)
      .input('AuthorName', sql.NVarChar(150), authorName.trim())
      .input('Bio', sql.NVarChar(sql.MAX), bio || null)
      .query(`
        UPDATE dbo.Authors
        SET AuthorName = @AuthorName, Bio = @Bio
        OUTPUT INSERTED.*
        WHERE AuthorID = @AuthorID
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tác giả.',
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật tác giả thành công.',
      data: result.recordset[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/authors/:id (Admin)
 */
const deleteAuthor = async (req, res, next) => {
  try {
    const authorId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const result = await pool
      .request()
      .input('AuthorID', sql.Int, authorId)
      .query('DELETE FROM dbo.Authors WHERE AuthorID = @AuthorID');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tác giả cần xóa.',
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa tác giả thành công.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/publishers
 * Lấy danh sách Nhà xuất bản hỗ trợ form quản trị sách
 */
const getPublishers = async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT PublisherID, PublisherName
      FROM dbo.Publishers
      ORDER BY PublisherName ASC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuthors,
  createAuthor,
  updateAuthor,
  deleteAuthor,
  getPublishers,
};

