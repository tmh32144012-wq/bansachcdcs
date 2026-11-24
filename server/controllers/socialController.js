const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');
const { registerSseClient, unregisterSseClient, createNotification } = require('../utils/helpers');
const { getJwtSecret, createSseTicket, consumeSseTicket } = require('../utils/security');
const { loadActiveUserForToken } = require('../middleware/authMiddleware');

/**
 * POST /api/social/follow-shop/:shopId
 * Bật / Tắt Theo dõi Shop (ShopFollowers)
 */
const toggleFollowShop = async (req, res, next) => {
  try {
    const shopId = parseInt(req.params.shopId, 10);
    if (isNaN(shopId)) {
      return res.status(400).json({ success: false, message: 'ID Gian hàng không hợp lệ.' });
    }

    const pool = await getPool();
    const shopRes = await pool
      .request()
      .input('ShopID', sql.Int, shopId)
      .query("SELECT ShopID, ShopName, OwnerID FROM dbo.Shops WHERE ShopID = @ShopID AND ApprovalStatus = N'Approved'");

    if (shopRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Gian hàng.' });
    }

    const shop = shopRes.recordset[0];
    const check = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .input('ShopID', sql.Int, shopId)
      .query('SELECT 1 FROM dbo.ShopFollowers WHERE UserID = @UserID AND ShopID = @ShopID');

    let isFollowing = false;
    if (check.recordset.length > 0) {
      await pool
        .request()
        .input('UserID', sql.Int, req.user.userId)
        .input('ShopID', sql.Int, shopId)
        .query('DELETE FROM dbo.ShopFollowers WHERE UserID = @UserID AND ShopID = @ShopID');
      isFollowing = false;
    } else {
      await pool
        .request()
        .input('UserID', sql.Int, req.user.userId)
        .input('ShopID', sql.Int, shopId)
        .query('INSERT INTO dbo.ShopFollowers (UserID, ShopID) VALUES (@UserID, @ShopID)');
      isFollowing = true;

      if (shop.OwnerID !== req.user.userId) {
        await createNotification(pool, {
          userId: shop.OwnerID,
          title: 'Có người theo dõi Gian hàng mới!',
          message: `${req.user.fullName} vừa bấm theo dõi Gian hàng "${shop.ShopName}".`,
          type: 'Shop',
          linkUrl: `/shops/${shop.ShopID}`,
        });
      }
    }

    const countRes = await pool
      .request()
      .input('ShopID', sql.Int, shopId)
      .query('SELECT COUNT(*) AS FollowerCount FROM dbo.ShopFollowers WHERE ShopID = @ShopID');

    res.json({
      success: true,
      message: isFollowing ? `Đã theo dõi ${shop.ShopName}!` : `Đã bỏ theo dõi ${shop.ShopName}.`,
      data: {
        isFollowing,
        followerCount: countRes.recordset[0].FollowerCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/followed-shops
 */
const getFollowedShops = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT
          s.ShopID, s.ShopName, s.Description, s.LogoUrl, s.PickupAddress, s.ShopType, sf.CreatedAt AS FollowedAt,
          (SELECT COUNT(*) FROM dbo.Books b WHERE b.ShopID = s.ShopID AND b.ApprovalStatus = N'Approved') AS BookCount,
          (SELECT COUNT(*) FROM dbo.ShopFollowers x WHERE x.ShopID = s.ShopID) AS FollowerCount,
          (SELECT AVG(CAST(r.Rating AS FLOAT)) FROM dbo.Reviews r WHERE r.ShopID = s.ShopID AND r.Status = N'Visible') AS AvgRating
        FROM dbo.ShopFollowers sf
        INNER JOIN dbo.Shops s ON sf.ShopID = s.ShopID
        WHERE sf.UserID = @UserID AND s.ApprovalStatus = N'Approved'
        ORDER BY sf.CreatedAt DESC
      `);

    res.json({
      success: true,
      data: resData.recordset.map((s) => ({
        ...s,
        AvgRating: s.AvgRating ? Number(Number(s.AvgRating).toFixed(1)) : 5.0,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/social/wishlist/:bookId
 * Bật / Tắt Sách yêu thích (Wishlists)
 */
const toggleWishlist = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.bookId, 10);
    if (isNaN(bookId)) {
      return res.status(400).json({ success: false, message: 'ID sách không hợp lệ.' });
    }

    const pool = await getPool();
    const check = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .input('BookID', sql.Int, bookId)
      .query('SELECT 1 FROM dbo.Wishlists WHERE UserID = @UserID AND BookID = @BookID');

    let isWishlisted = false;
    if (check.recordset.length > 0) {
      await pool
        .request()
        .input('UserID', sql.Int, req.user.userId)
        .input('BookID', sql.Int, bookId)
        .query('DELETE FROM dbo.Wishlists WHERE UserID = @UserID AND BookID = @BookID');
      isWishlisted = false;
    } else {
      await pool
        .request()
        .input('UserID', sql.Int, req.user.userId)
        .input('BookID', sql.Int, bookId)
        .query('INSERT INTO dbo.Wishlists (UserID, BookID) VALUES (@UserID, @BookID)');
      isWishlisted = true;
    }

    res.json({
      success: true,
      message: isWishlisted ? 'Đã thêm sách vào danh sách yêu thích.' : 'Đã bỏ sách khỏi danh sách yêu thích.',
      data: { isWishlisted },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/wishlist
 */
const getWishlist = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT
          b.BookID, b.ShopID, b.Title, b.ISBN, b.Price, b.DiscountPrice, b.Stock, b.SoldCount,
          b.CoverImage, b.BookCondition, b.Format, b.IsFlashSale, b.FlashSalePrice, b.FlashSaleEnd,
          s.ShopName, s.ShopType, w.CreatedAt AS SavedAt,
          STUFF((
            SELECT N', ' + a.AuthorName FROM dbo.BookAuthors ba
            INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
            WHERE ba.BookID = b.BookID FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS AuthorNames
        FROM dbo.Wishlists w
        INNER JOIN dbo.Books b ON w.BookID = b.BookID
        INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
        WHERE w.UserID = @UserID AND b.ApprovalStatus = N'Approved'
        ORDER BY w.CreatedAt DESC
      `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/social/notifications
 */
const getNotifications = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT TOP 40 *
        FROM dbo.Notifications
        WHERE UserID = @UserID
        ORDER BY CreatedAt DESC
      `);

    const unreadCount = resData.recordset.filter((n) => !n.IsRead).length;
    res.json({ success: true, data: resData.recordset, unreadCount });
  } catch (error) {
    next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await getPool();
    await pool
      .request()
      .input('NotificationID', sql.Int, id)
      .input('UserID', sql.Int, req.user.userId)
      .query('UPDATE dbo.Notifications SET IsRead = 1 WHERE NotificationID = @NotificationID AND UserID = @UserID');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const markAllNotificationsRead = async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query('UPDATE dbo.Notifications SET IsRead = 1 WHERE UserID = @UserID AND IsRead = 0');
    res.json({ success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/social/sse-ticket
 * Cấp vé SSE ngắn hạn (60 giây, dùng 1 lần) để kết nối EventSource mà không lộ JWT trên URL
 */
const issueSseTicket = (req, res) => {
  const ticket = createSseTicket(req.user.userId);
  res.json({
    success: true,
    data: { ticket, expiresInSeconds: 60 },
  });
};

/**
 * GET /api/social/stream?ticket=SINGLE_USE_TICKET
 * Kết nối SSE (Server-Sent Events) để đẩy Chat & Thông báo thời gian thực tới trình duyệt
 */
const streamEvents = async (req, res) => {
  let userId = null;

  if (req.query.ticket) {
    userId = consumeSseTicket(String(req.query.ticket));
  } else if (req.query.token) {
    // Tương thích ngược an toàn: kiểm tra cả IsActive & TokenVersion trong DB
    try {
      const decoded = jwt.verify(String(req.query.token), getJwtSecret());
      const resolved = await loadActiveUserForToken(decoded);
      if (resolved && !resolved.blocked && !resolved.revoked) {
        userId = resolved.userId;
      }
    } catch {
      userId = null;
    }
  }

  if (!userId) {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);
  registerSseClient(userId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (_) {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterSseClient(userId, res);
  });
};

module.exports = {
  toggleFollowShop,
  getFollowedShops,
  toggleWishlist,
  getWishlist,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  issueSseTicket,
  streamEvents,
};
