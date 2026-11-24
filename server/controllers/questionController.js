const { sql, getPool } = require('../config/db');
const { createNotification } = require('../utils/helpers');

/**
 * GET /api/books/:id/questions
 * Danh sách Hỏi đáp công khai cho 1 cuốn sách
 */
const getBookQuestions = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ success: false, message: 'Mã sách không hợp lệ.' });
    }

    const pool = await getPool();
    const resData = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .query(`
        SELECT
          q.QuestionID, q.BookID, q.UserID, q.Question, q.Answer, q.AnsweredAt, q.CreatedAt,
          u.FullName AS AskerName,
          au.FullName AS AnsweredByName, au.Role AS AnsweredByRole
        FROM dbo.BookQuestions q
        INNER JOIN dbo.Users u ON q.UserID = u.UserID
        LEFT JOIN dbo.Users au ON q.AnsweredBy = au.UserID
        WHERE q.BookID = @BookID
        ORDER BY q.CreatedAt DESC
      `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/books/:id/questions
 * Người dùng đặt câu hỏi công khai về cuốn sách (thông báo realtime cho Chủ Shop)
 */
const askBookQuestion = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const questionText = String(req.body?.question || '').trim();

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ success: false, message: 'Mã sách không hợp lệ.' });
    }
    if (questionText.length < 5) {
      return res.status(400).json({ success: false, message: 'Câu hỏi cần có ít nhất 5 ký tự.' });
    }
    if (questionText.length > 600) {
      return res.status(400).json({ success: false, message: 'Câu hỏi tối đa 600 ký tự.' });
    }

    const pool = await getPool();
    const bookRes = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .query(`
        SELECT b.BookID, b.Title, s.OwnerID AS ShopOwnerID
        FROM dbo.Books b
        INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
        WHERE b.BookID = @BookID AND b.ApprovalStatus = N'Approved'
      `);

    if (bookRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuốn sách.' });
    }

    const book = bookRes.recordset[0];
    const insertRes = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .input('UserID', sql.Int, req.user.userId)
      .input('Question', sql.NVarChar(600), questionText)
      .query(`
        INSERT INTO dbo.BookQuestions (BookID, UserID, Question)
        OUTPUT INSERTED.*
        VALUES (@BookID, @UserID, @Question)
      `);

    if (book.ShopOwnerID !== req.user.userId) {
      await createNotification(pool, {
        userId: book.ShopOwnerID,
        title: `Câu hỏi mới cho "${book.Title}"`,
        message: `${req.user.fullName} hỏi: "${questionText.slice(0, 90)}"`,
        type: 'Book',
        linkUrl: `/books/${bookId}`,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Đã gửi câu hỏi thành công!',
      data: {
        ...insertRes.recordset[0],
        AskerName: req.user.fullName,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/books/questions/:questionId/answer
 * Chủ Shop / Manager / Admin trả lời câu hỏi
 */
const answerBookQuestion = async (req, res, next) => {
  try {
    const questionId = parseInt(req.params.questionId, 10);
    const answerText = String(req.body?.answer || '').trim();

    if (!answerText) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung trả lời.' });
    }

    const pool = await getPool();
    const qRes = await pool
      .request()
      .input('QuestionID', sql.Int, questionId)
      .query(`
        SELECT q.QuestionID, q.BookID, q.UserID, b.Title, s.OwnerID AS ShopOwnerID, s.ShopName
        FROM dbo.BookQuestions q
        INNER JOIN dbo.Books b ON q.BookID = b.BookID
        INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
        WHERE q.QuestionID = @QuestionID
      `);

    if (qRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const q = qRes.recordset[0];
    const isStaff = req.user.role === 'Admin' || req.user.role === 'Manager';
    if (q.ShopOwnerID !== req.user.userId && !isStaff) {
      return res.status(403).json({ success: false, message: 'Chỉ chủ Gian hàng hoặc Quản lý mới được trả lời câu hỏi này.' });
    }

    await pool
      .request()
      .input('QuestionID', sql.Int, questionId)
      .input('Answer', sql.NVarChar(1000), answerText)
      .input('AnsweredBy', sql.Int, req.user.userId)
      .query('UPDATE dbo.BookQuestions SET Answer = @Answer, AnsweredBy = @AnsweredBy, AnsweredAt = SYSDATETIME() WHERE QuestionID = @QuestionID');

    if (q.UserID !== req.user.userId) {
      await createNotification(pool, {
        userId: q.UserID,
        title: `${q.ShopName} đã trả lời câu hỏi của bạn`,
        message: `Về "${q.Title}": ${answerText.slice(0, 90)}`,
        type: 'Book',
        linkUrl: `/books/${q.BookID}`,
      });
    }

    res.json({ success: true, message: 'Đã gửi câu trả lời!' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/books/questions/:questionId
 */
const deleteBookQuestion = async (req, res, next) => {
  try {
    const questionId = parseInt(req.params.questionId, 10);
    const pool = await getPool();
    const qRes = await pool
      .request()
      .input('QuestionID', sql.Int, questionId)
      .query('SELECT QuestionID, UserID FROM dbo.BookQuestions WHERE QuestionID = @QuestionID');

    if (qRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi.' });
    }

    const isStaff = req.user.role === 'Admin' || req.user.role === 'Manager';
    if (qRes.recordset[0].UserID !== req.user.userId && !isStaff) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa câu hỏi này.' });
    }

    await pool
      .request()
      .input('QuestionID', sql.Int, questionId)
      .query('DELETE FROM dbo.BookQuestions WHERE QuestionID = @QuestionID');

    res.json({ success: true, message: 'Đã xóa câu hỏi.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBookQuestions,
  askBookQuestion,
  answerBookQuestion,
  deleteBookQuestion,
};
