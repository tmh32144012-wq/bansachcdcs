const { sql, getPool } = require('../config/db');
const { safeJsonParse, createNotification, createAuditLog } = require('../utils/helpers');
const { hydrateOrders } = require('./orderController');

/**
 * GET /api/manager/overview
 * Thống kê nhanh cho Bảng điều khiển Quản lý (Manager)
 */
const getManagerOverview = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Shops WHERE ApprovalStatus = N'Pending') AS PendingShops,
        (SELECT COUNT(*) FROM dbo.Books WHERE ApprovalStatus = N'Pending') AS PendingBooks,
        (SELECT COUNT(*) FROM dbo.Orders WHERE Status IN (N'Pending', N'Confirmed', N'Packing', N'Shipping')) AS ActiveOrders,
        (SELECT COUNT(*) FROM dbo.Disputes WHERE Status IN (N'Open', N'Reviewing')) AS OpenDisputes,
        (SELECT COUNT(*) FROM dbo.Reviews WHERE Status = N'Reported') AS ReportedReviews,
        (SELECT COUNT(*) FROM dbo.Books WHERE IsFlashSale = 1 AND ApprovalStatus = N'Approved') AS FlashSaleBooks
    `);

    res.json({ success: true, data: resData.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/manager/shops
 */
const getShopsForReview = async (req, res, next) => {
  try {
    const { status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '1 = 1';
    if (status && status !== 'ALL') {
      request.input('Status', sql.NVarChar(20), status);
      where = 's.ApprovalStatus = @Status';
    }

    const resData = await request.query(`
      SELECT s.*, u.FullName AS OwnerName, u.Email AS OwnerEmail,
             r.FullName AS ReviewerName,
             (SELECT COUNT(*) FROM dbo.Books b WHERE b.ShopID = s.ShopID) AS BookCount,
             (SELECT COUNT(*) FROM dbo.ShopFollowers sf WHERE sf.ShopID = s.ShopID) AS FollowerCount
      FROM dbo.Shops s
      INNER JOIN dbo.Users u ON s.OwnerID = u.UserID
      LEFT JOIN dbo.Users r ON s.ReviewedBy = r.UserID
      WHERE ${where}
      ORDER BY CASE WHEN s.ApprovalStatus = N'Pending' THEN 0 ELSE 1 END, s.CreatedAt DESC
    `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/manager/shops/:id/review
 * Manager duyệt mở Shop (Approved / Rejected / Suspended)
 */
const reviewShop = async (req, res, next) => {
  try {
    const shopId = parseInt(req.params.id, 10);
    const { status, rejectionReason = '' } = req.body;

    if (!['Approved', 'Rejected', 'Suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái duyệt Shop không hợp lệ.' });
    }
    if ((status === 'Rejected' || status === 'Suspended') && !rejectionReason.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do từ chối hoặc tạm khóa Shop.' });
    }

    const pool = await getPool();
    const updateRes = await pool
      .request()
      .input('ShopID', sql.Int, shopId)
      .input('Status', sql.NVarChar(20), status)
      .input('ReviewedBy', sql.Int, req.user.userId)
      .input('Reason', sql.NVarChar(500), status === 'Approved' ? null : rejectionReason.trim())
      .query(`
        UPDATE dbo.Shops
        SET ApprovalStatus = @Status, ReviewedBy = @ReviewedBy, ReviewedAt = SYSDATETIME(), RejectionReason = @Reason
        OUTPUT INSERTED.*
        WHERE ShopID = @ShopID
      `);

    if (updateRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Gian hàng.' });
    }

    const shop = updateRes.recordset[0];

    await createNotification(pool, {
      userId: shop.OwnerID,
      title: status === 'Approved'
        ? `Chúc mừng! Gian hàng "${shop.ShopName}" đã được duyệt!`
        : `Thông báo về Gian hàng "${shop.ShopName}" (${status})`,
      message: status === 'Approved'
        ? 'Bạn đã có thể vào Kênh Người Bán để đăng sách lên sàn ngay hôm nay.'
        : `Lý do: ${rejectionReason.trim()}`,
      type: 'Shop',
      linkUrl: '/seller',
    });

    await createAuditLog(pool, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: `ReviewShop_${status}`,
      targetType: 'Shop',
      targetId: shopId,
      details: `Shop "${shop.ShopName}" -> ${status}${rejectionReason ? ` | Lý do: ${rejectionReason}` : ''}`,
    });

    res.json({ success: true, message: `Đã cập nhật trạng thái Gian hàng sang "${status}".`, data: shop });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/manager/books
 * Danh sách bài đăng bán sách để Manager đọc kiểm tra & duyệt
 */
const getBooksForReview = async (req, res, next) => {
  try {
    const { status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '1 = 1';
    if (status && status !== 'ALL') {
      request.input('Status', sql.NVarChar(20), status);
      where = 'b.ApprovalStatus = @Status';
    }

    const resData = await request.query(`
      SELECT
        b.*,
        s.ShopName, s.ShopType,
        u.FullName AS SellerName, u.Email AS SellerEmail,
        p.PublisherName,
        r.FullName AS ReviewerName,
        STUFF((
          SELECT N', ' + a.AuthorName FROM dbo.BookAuthors ba
          INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
          WHERE ba.BookID = b.BookID FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS AuthorNames,
        STUFF((
          SELECT N', ' + c.CategoryName FROM dbo.BookCategories bc
          INNER JOIN dbo.Categories c ON bc.CategoryID = c.CategoryID
          WHERE bc.BookID = b.BookID FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS CategoryNames
      FROM dbo.Books b
      INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
      INNER JOIN dbo.Users u ON b.SellerID = u.UserID
      LEFT JOIN dbo.Publishers p ON b.PublisherID = p.PublisherID
      LEFT JOIN dbo.Users r ON b.ReviewedBy = r.UserID
      WHERE ${where}
      ORDER BY CASE WHEN b.ApprovalStatus = N'Pending' THEN 0 ELSE 1 END, b.CreatedAt DESC
    `);

    const formatted = resData.recordset.map((b) => ({
      ...b,
      galleryImages: safeJsonParse(b.GalleryImages, []),
      previewImages: safeJsonParse(b.PreviewImages, []),
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/manager/books/:id/review
 * Manager duyệt bài bán sách (Approved / Rejected / Suspended)
 * Nếu Approved -> thông báo cho Chủ Shop + tất cả Khách hàng đang theo dõi Shop đó!
 */
const reviewBook = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const { status, rejectionReason = '' } = req.body;

    if (!['Approved', 'Rejected', 'Suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái duyệt sách không hợp lệ.' });
    }
    if ((status === 'Rejected' || status === 'Suspended') && !rejectionReason.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng ghi rõ lý do từ chối hoặc gỡ bài.' });
    }

    const pool = await getPool();
    const updateRes = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .input('Status', sql.NVarChar(20), status)
      .input('ReviewedBy', sql.Int, req.user.userId)
      .input('Reason', sql.NVarChar(500), status === 'Approved' ? null : rejectionReason.trim())
      .query(`
        UPDATE dbo.Books
        SET ApprovalStatus = @Status, ReviewedBy = @ReviewedBy, ReviewedAt = SYSDATETIME(), RejectionReason = @Reason
        OUTPUT INSERTED.*
        WHERE BookID = @BookID
      `);

    if (updateRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng sách.' });
    }

    const book = updateRes.recordset[0];

    // Thông báo cho người bán
    await createNotification(pool, {
      userId: book.SellerID,
      title: status === 'Approved'
        ? `Bài bán sách "${book.Title}" đã được duyệt!`
        : `Bài bán sách "${book.Title}" bị ${status === 'Rejected' ? 'từ chối' : 'tạm gỡ'}`,
      message: status === 'Approved'
        ? 'Cuốn sách của bạn đã chính thức hiển thị trên sàn VitaBook.'
        : `Lý do từ Quản lý: ${rejectionReason.trim()}`,
      type: 'Book',
      linkUrl: status === 'Approved' ? `/books/${book.BookID}` : '/seller',
    });

    // Nếu được duyệt lên kệ -> báo cho khách đang Theo dõi Shop này biết!
    if (status === 'Approved') {
      const followersRes = await pool
        .request()
        .input('ShopID', sql.Int, book.ShopID)
        .query(`
          SELECT sf.UserID, s.ShopName
          FROM dbo.ShopFollowers sf
          INNER JOIN dbo.Shops s ON sf.ShopID = s.ShopID
          WHERE sf.ShopID = @ShopID
        `);

      for (const f of followersRes.recordset) {
        if (f.UserID !== book.SellerID) {
          await createNotification(pool, {
            userId: f.UserID,
            title: `${f.ShopName} vừa đăng sách mới!`,
            message: `Cuốn "${book.Title}" vừa lên kệ. Xem ngay để không bỏ lỡ!`,
            type: 'Book',
            linkUrl: `/books/${book.BookID}`,
          });
        }
      }
    }

    await createAuditLog(pool, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: `ReviewBook_${status}`,
      targetType: 'Book',
      targetId: bookId,
      details: `Sách "${book.Title}" -> ${status}${rejectionReason ? ` | Lý do: ${rejectionReason}` : ''}`,
    });

    res.json({ success: true, message: `Đã cập nhật trạng thái kiểm duyệt sách sang "${status}".`, data: book });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/manager/books/:id/flash-sale
 */
const toggleFlashSale = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const { isFlashSale, flashSalePrice, flashSaleDays = 3 } = req.body;
    const pool = await getPool();

    const endDate = isFlashSale ? new Date(Date.now() + Number(flashSaleDays) * 86400000) : null;

    const resData = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .input('IsFlashSale', sql.Bit, isFlashSale ? 1 : 0)
      .input('FlashSalePrice', sql.Decimal(18, 2), isFlashSale && flashSalePrice ? parseFloat(flashSalePrice) : null)
      .input('FlashSaleEnd', sql.DateTime2, endDate)
      .query(`
        UPDATE dbo.Books
        SET IsFlashSale = @IsFlashSale, FlashSalePrice = @FlashSalePrice, FlashSaleEnd = @FlashSaleEnd
        OUTPUT INSERTED.*
        WHERE BookID = @BookID AND ApprovalStatus = N'Approved'
      `);

    if (resData.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Sách chưa được duyệt hoặc không tồn tại.' });
    }

    await createAuditLog(pool, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: isFlashSale ? 'EnableFlashSale' : 'DisableFlashSale',
      targetType: 'Book',
      targetId: bookId,
      details: isFlashSale ? `Bật Flash Sale giá ${flashSalePrice}đ` : 'Tắt Flash Sale',
    });

    res.json({ success: true, message: isFlashSale ? 'Đã thêm sách vào Flash Sale Tết!' : 'Đã gỡ khỏi Flash Sale.', data: resData.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/manager/orders
 * Danh sách toàn bộ đơn hàng trên sàn để Manager theo dõi & cập nhật hành trình vận chuyển
 */
const getAllOrdersForTracking = async (req, res, next) => {
  try {
    const { status } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '1 = 1';
    if (status && status !== 'ALL') {
      request.input('Status', sql.NVarChar(50), status);
      where = 'o.Status = @Status';
    }

    const ordersRes = await request.query(`
      SELECT o.*, u.FullName AS CustomerName, u.Email AS CustomerEmail,
             s.ShopName, s.OwnerID AS ShopOwnerID
      FROM dbo.Orders o
      INNER JOIN dbo.Users u ON o.UserID = u.UserID
      INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
      WHERE ${where}
      ORDER BY o.CreatedAt DESC
    `);

    const hydrated = await hydrateOrders(pool, ordersRes.recordset);
    res.json({ success: true, data: hydrated });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/manager/orders/:id/tracking
 * TÍNH NĂNG CỐT LÕI: Manager ghi lại đơn hàng đã vận chuyển tới đâu (Mốc + Địa điểm + Ghi chú)
 * Tự động cập nhật trạng thái đơn, trạng thái COD khi Delivered, và gửi thông báo cho khách hàng + Shop!
 */
const addTrackingEvent = async (req, res, next) => {
  let transaction;
  try {
    const orderId = parseInt(req.params.id, 10);
    const { stage, title, location, description } = req.body;

    if (!stage || !title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn giai đoạn và nhập tiêu đề hành trình vận chuyển.',
      });
    }

    const stageToOrderStatus = {
      ShopConfirmed: 'Confirmed',
      Packing: 'Packing',
      PickedUp: 'Shipping',
      InTransit: 'Shipping',
      AtWarehouse: 'Shipping',
      OutForDelivery: 'Shipping',
      DeliveryFailed: 'Shipping',
      Delivered: 'Delivered',
      Returned: 'Cancelled',
    };

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const orderRes = await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .query(`
        SELECT o.*, s.OwnerID AS ShopOwnerID, s.ShopName
        FROM dbo.Orders o WITH (UPDLOCK)
        INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
        WHERE o.OrderID = @OrderID
      `);

    if (orderRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    const order = orderRes.recordset[0];
    if (['Completed', 'Cancelled', 'Refunded'].includes(order.Status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Đơn hàng đang ở trạng thái "${order.Status}", không thể cập nhật thêm hành trình.`,
      });
    }

    const nextOrderStatus = stageToOrderStatus[stage] || order.Status;
    let nextPaymentStatus = order.PaymentStatus;
    if (nextOrderStatus === 'Delivered' && order.PaymentType === 'COD') {
      nextPaymentStatus = 'Paid';
    } else if (nextOrderStatus === 'Cancelled' && order.PaymentType === 'Prepaid') {
      nextPaymentStatus = 'Refunded';
    }

    // Nếu hoàn trả về Shop (Returned), hoàn lại tồn kho
    if (stage === 'Returned' && order.Status !== 'Cancelled') {
      const itemsRes = await new sql.Request(transaction)
        .input('OrderID', sql.Int, orderId)
        .query('SELECT BookID, Quantity FROM dbo.OrderDetails WHERE OrderID = @OrderID');
      for (const item of itemsRes.recordset) {
        await new sql.Request(transaction)
          .input('BookID', sql.Int, item.BookID)
          .input('Quantity', sql.Int, item.Quantity)
          .query('UPDATE dbo.Books SET Stock = Stock + @Quantity WHERE BookID = @BookID');
      }
    }

    await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('Status', sql.NVarChar(50), nextOrderStatus)
      .input('PaymentStatus', sql.NVarChar(50), nextPaymentStatus)
      .query('UPDATE dbo.Orders SET Status = @Status, PaymentStatus = @PaymentStatus, UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID');

    const insertedEvent = await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('Stage', sql.NVarChar(50), stage)
      .input('Title', sql.NVarChar(200), title.trim())
      .input('Location', sql.NVarChar(250), location?.trim() || null)
      .input('Description', sql.NVarChar(500), description?.trim() || null)
      .input('UpdatedBy', sql.Int, req.user.userId)
      .query(`
        INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy)
        OUTPUT INSERTED.*
        VALUES (@OrderID, @Stage, @Title, @Location, @Description, @UpdatedBy)
      `);

    await createAuditLog(transaction, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'UpdateOrderTracking',
      targetType: 'Order',
      targetId: orderId,
      details: `[${stage}] ${title.trim()}${location ? ` @ ${location.trim()}` : ''}`,
    });

    await transaction.commit();

    // Đẩy thông báo realtime cho Khách hàng & Chủ Shop
    await createNotification(pool, {
      userId: order.UserID,
      title: `Hành trình đơn #${orderId}: ${title.trim()}`,
      message: `${location ? `[${location.trim()}] ` : ''}${description?.trim() || 'Đơn hàng của bạn vừa có cập nhật vận chuyển mới.'}`,
      type: 'Tracking',
      linkUrl: '/orders',
    });

    if (order.ShopOwnerID !== order.UserID) {
      await createNotification(pool, {
        userId: order.ShopOwnerID,
        title: `Vận chuyển đơn #${orderId}: ${title.trim()}`,
        message: `${location ? `[${location.trim()}] ` : ''}Trạng thái đơn hiện tại: ${nextOrderStatus}.`,
        type: 'Tracking',
        linkUrl: '/seller',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Đã ghi nhận mốc hành trình vận chuyển và thông báo cho khách hàng!',
      data: insertedEvent.recordset[0],
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * GET /api/manager/disputes
 */
const getDisputes = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query(`
      SELECT d.*, o.TotalAmount, o.PaymentType, o.PaymentMethod, o.Status AS OrderStatus,
             u.FullName AS BuyerName, u.Email AS BuyerEmail,
             s.ShopName, m.FullName AS ManagerName
      FROM dbo.Disputes d
      INNER JOIN dbo.Orders o ON d.OrderID = o.OrderID
      INNER JOIN dbo.Users u ON d.BuyerID = u.UserID
      INNER JOIN dbo.Shops s ON d.ShopID = s.ShopID
      LEFT JOIN dbo.Users m ON d.ManagerID = m.UserID
      ORDER BY CASE WHEN d.Status IN (N'Open', N'Reviewing') THEN 0 ELSE 1 END, d.CreatedAt DESC
    `);

    const formatted = resData.recordset.map((d) => ({
      ...d,
      evidenceImages: safeJsonParse(d.EvidenceImages, []),
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/manager/disputes/:id/resolve
 * Manager làm trọng tài phân xử khiếu nại / trả hàng hoàn tiền
 */
const resolveDispute = async (req, res, next) => {
  let transaction;
  try {
    const disputeId = parseInt(req.params.id, 10);
    const { decision, resolutionNote } = req.body; // 'ResolvedRefund' | 'ResolvedReject'

    if (!['ResolvedRefund', 'ResolvedReject'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Quyết định phân xử không hợp lệ.' });
    }
    if (!resolutionNote || !resolutionNote.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập kết luận phân xử rõ ràng.' });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const dispRes = await new sql.Request(transaction)
      .input('DisputeID', sql.Int, disputeId)
      .query(`
        SELECT d.*, o.SellerNetAmount, o.IsSettled, o.CommissionRate, o.CommissionAmount, s.OwnerID AS ShopOwnerID, s.ShopName
        FROM dbo.Disputes d WITH (UPDLOCK)
        INNER JOIN dbo.Orders o ON d.OrderID = o.OrderID
        INNER JOIN dbo.Shops s ON d.ShopID = s.ShopID
        WHERE d.DisputeID = @DisputeID
      `);

    if (dispRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu khiếu nại.' });
    }

    const dispute = dispRes.recordset[0];
    if (['ResolvedRefund', 'ResolvedReject'].includes(dispute.Status)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Khiếu nại này đã được giải quyết trước đó.' });
    }

    await new sql.Request(transaction)
      .input('DisputeID', sql.Int, disputeId)
      .input('Status', sql.NVarChar(30), decision)
      .input('ManagerID', sql.Int, req.user.userId)
      .input('Note', sql.NVarChar(1000), resolutionNote.trim())
      .query(`
        UPDATE dbo.Disputes
        SET Status = @Status, ManagerID = @ManagerID, ResolutionNote = @Note, ResolvedAt = SYSDATETIME()
        WHERE DisputeID = @DisputeID
      `);

    if (decision === 'ResolvedRefund') {
      await new sql.Request(transaction)
        .input('OrderID', sql.Int, dispute.OrderID)
        .query("UPDATE dbo.Orders SET Status = N'Refunded', PaymentStatus = N'Refunded', UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID");

      // Hoàn kho
      const itemsRes = await new sql.Request(transaction)
        .input('OrderID', sql.Int, dispute.OrderID)
        .query('SELECT BookID, Quantity FROM dbo.OrderDetails WHERE OrderID = @OrderID');
      for (const item of itemsRes.recordset) {
        await new sql.Request(transaction)
          .input('BookID', sql.Int, item.BookID)
          .input('Quantity', sql.Int, item.Quantity)
          .query('UPDATE dbo.Books SET Stock = Stock + @Quantity WHERE BookID = @BookID');
      }
    } else {
      // Từ chối khiếu nại -> Hoàn tất đơn và giải ngân cho Shop
      await new sql.Request(transaction)
        .input('OrderID', sql.Int, dispute.OrderID)
        .query("UPDATE dbo.Orders SET Status = N'Completed', PaymentStatus = N'Paid', IsSettled = 1, UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID");

      if (!dispute.IsSettled) {
        await new sql.Request(transaction)
          .input('ShopID', sql.Int, dispute.ShopID)
          .input('Amount', sql.Decimal(18, 2), Number(dispute.SellerNetAmount))
          .query('UPDATE dbo.Shops SET WalletBalance = WalletBalance + @Amount WHERE ShopID = @ShopID');

        await new sql.Request(transaction)
          .input('ShopID', sql.Int, dispute.ShopID)
          .input('OrderID', sql.Int, dispute.OrderID)
          .input('Amount', sql.Decimal(18, 2), Number(dispute.SellerNetAmount))
          .input('Note', sql.NVarChar(500), `Giải ngân đơn #${dispute.OrderID} sau khi từ chối khiếu nại`)
          .query(`
            INSERT INTO dbo.WalletTransactions (ShopID, OrderID, Type, Amount, Status, Note)
            VALUES (@ShopID, @OrderID, N'OrderSettlement', @Amount, N'Completed', @Note)
          `);
      }
    }

    await createAuditLog(transaction, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: `ResolveDispute_${decision}`,
      targetType: 'Dispute',
      targetId: disputeId,
      details: `Đơn #${dispute.OrderID} -> ${decision} | ${resolutionNote.trim()}`,
    });

    await transaction.commit();

    await createNotification(pool, {
      userId: dispute.BuyerID,
      title: `Kết quả khiếu nại đơn #${dispute.OrderID}`,
      message: decision === 'ResolvedRefund'
        ? `Quản lý đã chấp thuận HOÀN TIỀN cho bạn. Ghi chú: ${resolutionNote.trim()}`
        : `Quản lý đã từ chối yêu cầu hoàn tiền. Ghi chú: ${resolutionNote.trim()}`,
      type: 'Dispute',
      linkUrl: '/orders',
    });

    await createNotification(pool, {
      userId: dispute.ShopOwnerID,
      title: `Kết quả phân xử khiếu nại đơn #${dispute.OrderID}`,
      message: decision === 'ResolvedRefund'
        ? `Đơn #${dispute.OrderID} được hoàn tiền cho khách. Ghi chú: ${resolutionNote.trim()}`
        : `Khiếu nại không hợp lệ, doanh thu đã được cộng vào Ví Shop.`,
      type: 'Dispute',
      linkUrl: '/seller',
    });

    res.json({ success: true, message: 'Đã phân xử khiếu nại thành công.' });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * GET /api/manager/reviews & PUT /api/manager/reviews/:id
 */
const getReviewsForModeration = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query(`
      SELECT r.*, b.Title AS BookTitle, s.ShopName, u.FullName AS ReviewerName
      FROM dbo.Reviews r
      INNER JOIN dbo.Books b ON r.BookID = b.BookID
      INNER JOIN dbo.Shops s ON r.ShopID = s.ShopID
      INNER JOIN dbo.Users u ON r.UserID = u.UserID
      ORDER BY CASE WHEN r.Status = N'Reported' THEN 0 ELSE 1 END, r.CreatedAt DESC
    `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

const moderateReview = async (req, res, next) => {
  try {
    const reviewId = parseInt(req.params.id, 10);
    const { status } = req.body; // 'Visible' | 'Hidden'

    if (!['Visible', 'Hidden'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái đánh giá không hợp lệ.' });
    }

    const pool = await getPool();
    await pool
      .request()
      .input('ReviewID', sql.Int, reviewId)
      .input('Status', sql.NVarChar(20), status)
      .query('UPDATE dbo.Reviews SET Status = @Status WHERE ReviewID = @ReviewID');

    await createAuditLog(pool, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: `ModerateReview_${status}`,
      targetType: 'Review',
      targetId: reviewId,
      details: `Đổi trạng thái đánh giá #${reviewId} thành ${status}`,
    });

    res.json({ success: true, message: status === 'Hidden' ? 'Đã ẩn đánh giá vi phạm.' : 'Đã khôi phục hiển thị đánh giá.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getManagerOverview,
  getShopsForReview,
  reviewShop,
  getBooksForReview,
  reviewBook,
  toggleFlashSale,
  getAllOrdersForTracking,
  addTrackingEvent,
  getDisputes,
  resolveDispute,
  getReviewsForModeration,
  moderateReview,
};
