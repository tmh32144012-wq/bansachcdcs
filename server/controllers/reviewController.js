const { sql, getPool } = require('../config/db');
const { createNotification, notifyManagers } = require('../utils/helpers');

/**
 * POST /api/reviews
 * Chỉ khách hàng đã mua và nhận hàng thành công (Delivered / Completed) mới được đánh giá
 */
const createReview = async (req, res, next) => {
  try {
    const { bookId, orderId, rating, comment = '', images = [] } = req.body;
    const rVal = parseInt(rating, 10);

    if (!bookId || !orderId || isNaN(rVal) || rVal < 1 || rVal > 5) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn số sao từ 1 đến 5.' });
    }

    const pool = await getPool();
    const verifyRes = await pool
      .request()
      .input('OrderID', sql.Int, parseInt(orderId, 10))
      .input('BookID', sql.Int, parseInt(bookId, 10))
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT o.OrderID, o.ShopID, o.Status, s.OwnerID AS ShopOwnerID, b.Title
        FROM dbo.Orders o
        INNER JOIN dbo.OrderDetails od ON o.OrderID = od.OrderID
        INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
        INNER JOIN dbo.Books b ON od.BookID = b.BookID
        WHERE o.OrderID = @OrderID AND od.BookID = @BookID AND o.UserID = @UserID
      `);

    if (verifyRes.recordset.length === 0) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ có thể đánh giá cuốn sách đã mua.' });
    }

    const info = verifyRes.recordset[0];
    if (!['Delivered', 'Completed'].includes(info.Status)) {
      return res.status(400).json({ success: false, message: 'Vui lòng chờ đơn hàng giao thành công trước khi đánh giá.' });
    }

    const dupCheck = await pool
      .request()
      .input('OrderID', sql.Int, info.OrderID)
      .input('BookID', sql.Int, parseInt(bookId, 10))
      .input('UserID', sql.Int, req.user.userId)
      .query('SELECT ReviewID FROM dbo.Reviews WHERE OrderID = @OrderID AND BookID = @BookID AND UserID = @UserID');

    if (dupCheck.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Bạn đã đánh giá cuốn sách này cho đơn hàng này rồi.' });
    }

    const inserted = await pool
      .request()
      .input('BookID', sql.Int, parseInt(bookId, 10))
      .input('ShopID', sql.Int, info.ShopID)
      .input('UserID', sql.Int, req.user.userId)
      .input('OrderID', sql.Int, info.OrderID)
      .input('Rating', sql.Int, rVal)
      .input('Comment', sql.NVarChar(1000), comment.trim())
      .input('Images', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(images) ? images : []))
      .query(`
        INSERT INTO dbo.Reviews (BookID, ShopID, UserID, OrderID, Rating, Comment, Images)
        OUTPUT INSERTED.*
        VALUES (@BookID, @ShopID, @UserID, @OrderID, @Rating, @Comment, @Images)
      `);

    await createNotification(pool, {
      userId: info.ShopOwnerID,
      title: `Đánh giá ${rVal}⭐ mới cho "${info.Title}"`,
      message: `${req.user.fullName}: "${comment.trim().slice(0, 80) || 'Đánh giá hài lòng'}"`,
      type: 'Book',
      linkUrl: `/books/${bookId}`,
    });

    res.status(201).json({ success: true, message: 'Cảm ơn bạn đã đánh giá cuốn sách!', data: inserted.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/reviews/:id/reply (Chủ Shop phản hồi đánh giá)
 */
const replyReview = async (req, res, next) => {
  try {
    const reviewId = parseInt(req.params.id, 10);
    const { sellerReply } = req.body;
    if (!sellerReply || !sellerReply.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung phản hồi không được để trống.' });
    }

    const pool = await getPool();
    const checkRes = await pool
      .request()
      .input('ReviewID', sql.Int, reviewId)
      .query(`
        SELECT r.ReviewID, r.UserID, s.OwnerID, s.ShopName, r.BookID
        FROM dbo.Reviews r
        INNER JOIN dbo.Shops s ON r.ShopID = s.ShopID
        WHERE r.ReviewID = @ReviewID
      `);

    if (checkRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá.' });
    }

    const rev = checkRes.recordset[0];
    if (rev.OwnerID !== req.user.userId && req.user.role === 'Customer') {
      return res.status(403).json({ success: false, message: 'Chỉ chủ Gian hàng mới có thể phản hồi đánh giá này.' });
    }

    await pool
      .request()
      .input('ReviewID', sql.Int, reviewId)
      .input('Reply', sql.NVarChar(1000), sellerReply.trim())
      .query('UPDATE dbo.Reviews SET SellerReply = @Reply, SellerRepliedAt = SYSDATETIME() WHERE ReviewID = @ReviewID');

    await createNotification(pool, {
      userId: rev.UserID,
      title: `${rev.ShopName} đã phản hồi đánh giá của bạn`,
      message: sellerReply.trim().slice(0, 100),
      type: 'Book',
      linkUrl: `/books/${rev.BookID}`,
    });

    res.json({ success: true, message: 'Đã gửi phản hồi đánh giá.' });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/reviews/:id/report (Báo cáo đánh giá vi phạm lên Manager)
 */
const reportReview = async (req, res, next) => {
  try {
    const reviewId = parseInt(req.params.id, 10);
    const { reason = 'Nội dung không phù hợp / spam' } = req.body;
    const pool = await getPool();

    await pool
      .request()
      .input('ReviewID', sql.Int, reviewId)
      .input('Reason', sql.NVarChar(300), reason.trim())
      .query("UPDATE dbo.Reviews SET Status = N'Reported', ReportReason = @Reason WHERE ReviewID = @ReviewID");

    await notifyManagers(pool, {
      title: 'Có báo cáo đánh giá vi phạm',
      message: `Đánh giá #${reviewId} bị báo cáo: "${reason.trim()}". Vui lòng kiểm duyệt.`,
      type: 'System',
      linkUrl: '/manager',
    });

    res.json({ success: true, message: 'Đã gửi báo cáo lên Quản lý kiểm duyệt.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/eligible/:bookId
 * Kiểm tra xem người dùng hiện tại có đơn hàng nào đã nhận sách này mà chưa viết đánh giá không
 * (phục vụ form viết đánh giá trực tiếp ngay trên trang Chi tiết sách)
 */
const getEligibleOrdersForBook = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.bookId, 10);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ success: false, message: 'Mã sách không hợp lệ.' });
    }

    const pool = await getPool();
    const eligibleRes = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT o.OrderID, o.Status, o.CreatedAt
        FROM dbo.Orders o
        INNER JOIN dbo.OrderDetails od ON o.OrderID = od.OrderID
        WHERE o.UserID = @UserID
          AND od.BookID = @BookID
          AND o.Status IN (N'Delivered', N'Completed')
          AND NOT EXISTS (
            SELECT 1 FROM dbo.Reviews r
            WHERE r.OrderID = o.OrderID AND r.BookID = @BookID AND r.UserID = @UserID
          )
        ORDER BY o.CreatedAt DESC
      `);

    res.json({
      success: true,
      data: {
        canReview: eligibleRes.recordset.length > 0,
        eligibleOrders: eligibleRes.recordset,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEligibleOrdersForBook,
  createReview,
  replyReview,
  reportReview,
};
