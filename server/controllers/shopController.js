const { sql, getPool } = require('../config/db');
const { safeJsonParse, notifyManagers, createNotification } = require('../utils/helpers');

/**
 * GET /api/shops
 * Danh sách tất cả Gian hàng đã được duyệt trên sàn
 */
const getPublicShops = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query(`
      SELECT
        s.ShopID, s.OwnerID, s.ShopName, s.Description, s.LogoUrl, s.BannerUrl,
        s.PickupAddress, s.Phone, s.ShopType, s.CreatedAt,
        (SELECT COUNT(*) FROM dbo.Books b WHERE b.ShopID = s.ShopID AND b.ApprovalStatus = N'Approved') AS BookCount,
        (SELECT COUNT(*) FROM dbo.ShopFollowers sf WHERE sf.ShopID = s.ShopID) AS FollowerCount,
        (SELECT AVG(CAST(r.Rating AS FLOAT)) FROM dbo.Reviews r WHERE r.ShopID = s.ShopID AND r.Status = N'Visible') AS AvgRating,
        (SELECT COUNT(*) FROM dbo.Reviews r WHERE r.ShopID = s.ShopID AND r.Status = N'Visible') AS ReviewCount
      FROM dbo.Shops s
      WHERE s.ApprovalStatus = N'Approved'
      ORDER BY s.ShopType ASC, FollowerCount DESC, s.ShopID ASC
    `);

    const shops = resData.recordset.map((s) => ({
      ...s,
      AvgRating: s.AvgRating ? Number(Number(s.AvgRating).toFixed(1)) : 5.0,
    }));

    res.json({ success: true, data: shops });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/shops/:id
 * Trang riêng của 1 Gian hàng (Thông tin Shop, Sách đang bán, Voucher Shop, Trạng thái Follow)
 */
const getShopById = async (req, res, next) => {
  try {
    const shopId = parseInt(req.params.id, 10);
    if (isNaN(shopId)) {
      return res.status(400).json({ success: false, message: 'ID gian hàng không hợp lệ.' });
    }

    const pool = await getPool();
    const userId = req.user?.userId || null;

    const reqObj = pool.request().input('ShopID', sql.Int, shopId);
    if (userId) reqObj.input('UserID', sql.Int, userId);

    const result = await reqObj.query(`
      SELECT
        s.ShopID, s.OwnerID, s.ShopName, s.Description, s.LogoUrl, s.BannerUrl,
        s.PickupAddress, s.Phone, s.ShopType, s.ApprovalStatus, s.CreatedAt,
        u.FullName AS OwnerName,
        (SELECT COUNT(*) FROM dbo.Books b WHERE b.ShopID = s.ShopID AND b.ApprovalStatus = N'Approved') AS BookCount,
        (SELECT COUNT(*) FROM dbo.ShopFollowers sf WHERE sf.ShopID = s.ShopID) AS FollowerCount,
        (SELECT AVG(CAST(r.Rating AS FLOAT)) FROM dbo.Reviews r WHERE r.ShopID = s.ShopID AND r.Status = N'Visible') AS AvgRating,
        (SELECT COUNT(*) FROM dbo.Reviews r WHERE r.ShopID = s.ShopID AND r.Status = N'Visible') AS ReviewCount
        ${userId ? ', CASE WHEN EXISTS (SELECT 1 FROM dbo.ShopFollowers WHERE ShopID = s.ShopID AND UserID = @UserID) THEN 1 ELSE 0 END AS IsFollowing' : ', 0 AS IsFollowing'}
      FROM dbo.Shops s
      INNER JOIN dbo.Users u ON s.OwnerID = u.UserID
      WHERE s.ShopID = @ShopID AND s.ApprovalStatus = N'Approved';

      SELECT
        b.BookID, b.ShopID, b.Title, b.ISBN, b.Price, b.DiscountPrice, b.Stock, b.SoldCount,
        b.CoverImage, b.BookCondition, b.Format, b.IsFlashSale, b.FlashSalePrice, b.FlashSaleEnd,
        s.ShopName, s.ShopType,
        (SELECT AVG(CAST(r.Rating AS FLOAT)) FROM dbo.Reviews r WHERE r.BookID = b.BookID AND r.Status = N'Visible') AS AvgRating,
        STUFF((
          SELECT N', ' + a.AuthorName FROM dbo.BookAuthors ba
          INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
          WHERE ba.BookID = b.BookID FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS AuthorNames
      FROM dbo.Books b
      INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
      WHERE b.ShopID = @ShopID AND b.ApprovalStatus = N'Approved'
      ORDER BY b.CreatedAt DESC;

      SELECT VoucherID, Code, Title, DiscountType, DiscountValue, MaxDiscount, MinOrderValue, UsageLimit, UsedCount, EndDate
      FROM dbo.Vouchers
      WHERE ShopID = @ShopID AND Scope = N'Shop' AND IsActive = 1 AND EndDate > SYSDATETIME() AND UsedCount < UsageLimit;
    `);

    if (result.recordsets[0].length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Gian hàng này.' });
    }

    const shop = result.recordsets[0][0];
    res.json({
      success: true,
      data: {
        ...shop,
        AvgRating: shop.AvgRating ? Number(Number(shop.AvgRating).toFixed(1)) : 5.0,
        isFollowing: Boolean(shop.IsFollowing),
        books: result.recordsets[1],
        vouchers: result.recordsets[2],
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/seller/register-shop
 * Khách hàng gửi đơn đăng ký mở Gian hàng (Chờ Manager duyệt)
 */
const registerShop = async (req, res, next) => {
  try {
    const { shopName, description, pickupAddress, phone, shopType = 'Individual', logoUrl } = req.body;

    if (!shopName || !pickupAddress || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Tên Gian hàng, Địa chỉ lấy hàng và Số điện thoại.',
      });
    }

    const pool = await getPool();
    const existing = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .query('SELECT ShopID, ApprovalStatus FROM dbo.Shops WHERE OwnerID = @OwnerID');

    if (existing.recordset.length > 0) {
      const current = existing.recordset[0];
      if (current.ApprovalStatus === 'Rejected') {
        // Cho phép gửi lại hồ sơ nếu từng bị từ chối
        const updated = await pool
          .request()
          .input('ShopID', sql.Int, current.ShopID)
          .input('ShopName', sql.NVarChar(150), shopName.trim())
          .input('Description', sql.NVarChar(sql.MAX), description || null)
          .input('PickupAddress', sql.NVarChar(500), pickupAddress.trim())
          .input('Phone', sql.VarChar(20), phone.trim())
          .input('ShopType', sql.NVarChar(50), shopType)
          .input('LogoUrl', sql.VarChar(500), logoUrl || null)
          .query(`
            UPDATE dbo.Shops
            SET ShopName = @ShopName, Description = @Description, PickupAddress = @PickupAddress,
                Phone = @Phone, ShopType = @ShopType, LogoUrl = @LogoUrl,
                ApprovalStatus = N'Pending', RejectionReason = NULL
            OUTPUT INSERTED.*
            WHERE ShopID = @ShopID
          `);

        await notifyManagers(pool, {
          title: 'Hồ sơ đăng ký mở Shop gửi lại',
          message: `Khách hàng ${req.user.fullName} vừa gửi lại hồ sơ mở Shop "${shopName.trim()}".`,
          type: 'Shop',
          linkUrl: '/manager',
        });

        return res.json({
          success: true,
          message: 'Đã gửi lại hồ sơ mở Gian hàng. Vui lòng chờ Quản lý xét duyệt!',
          data: updated.recordset[0],
        });
      }

      return res.status(409).json({
        success: false,
        message: 'Tài khoản của bạn đã có hồ sơ Gian hàng trong hệ thống.',
      });
    }

    const inserted = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .input('ShopName', sql.NVarChar(150), shopName.trim())
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('PickupAddress', sql.NVarChar(500), pickupAddress.trim())
      .input('Phone', sql.VarChar(20), phone.trim())
      .input('ShopType', sql.NVarChar(50), shopType)
      .input('LogoUrl', sql.VarChar(500), logoUrl || null)
      .query(`
        INSERT INTO dbo.Shops (OwnerID, ShopName, Description, PickupAddress, Phone, ShopType, LogoUrl, ApprovalStatus)
        OUTPUT INSERTED.*
        VALUES (@OwnerID, @ShopName, @Description, @PickupAddress, @Phone, @ShopType, @LogoUrl, N'Pending')
      `);

    await notifyManagers(pool, {
      title: 'Có đơn đăng ký mở Gian hàng mới',
      message: `Người dùng ${req.user.fullName} muốn mở Shop "${shopName.trim()}". Hãy kiểm tra và xét duyệt.`,
      type: 'Shop',
      linkUrl: '/manager',
    });

    res.status(201).json({
      success: true,
      message: 'Gửi hồ sơ mở Gian hàng thành công! Quản lý sàn sẽ kiểm tra và duyệt sớm nhất.',
      data: inserted.recordset[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/my-shop
 */
const getMyShop = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .query(`
        SELECT
          s.*,
          (SELECT COUNT(*) FROM dbo.Books b WHERE b.ShopID = s.ShopID) AS TotalBooks,
          (SELECT COUNT(*) FROM dbo.Books b WHERE b.ShopID = s.ShopID AND b.ApprovalStatus = N'Approved') AS ApprovedBooks,
          (SELECT COUNT(*) FROM dbo.Books b WHERE b.ShopID = s.ShopID AND b.ApprovalStatus = N'Pending') AS PendingBooks,
          (SELECT COUNT(*) FROM dbo.ShopFollowers sf WHERE sf.ShopID = s.ShopID) AS FollowerCount,
          (SELECT COUNT(*) FROM dbo.Orders o WHERE o.ShopID = s.ShopID) AS TotalOrders,
          (SELECT ISNULL(SUM(o.SellerNetAmount), 0) FROM dbo.Orders o WHERE o.ShopID = s.ShopID AND o.IsSettled = 1) AS TotalSettledRevenue
        FROM dbo.Shops s
        WHERE s.OwnerID = @OwnerID
      `);

    res.json({
      success: true,
      data: resData.recordset[0] || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/seller/my-shop
 */
const updateMyShop = async (req, res, next) => {
  try {
    const { shopName, description, pickupAddress, phone, logoUrl, bannerUrl } = req.body;
    const pool = await getPool();

    const updated = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .input('ShopName', sql.NVarChar(150), shopName?.trim())
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('PickupAddress', sql.NVarChar(500), pickupAddress?.trim())
      .input('Phone', sql.VarChar(20), phone?.trim())
      .input('LogoUrl', sql.VarChar(500), logoUrl || null)
      .input('BannerUrl', sql.VarChar(500), bannerUrl || null)
      .query(`
        UPDATE dbo.Shops
        SET ShopName = ISNULL(@ShopName, ShopName),
            Description = @Description,
            PickupAddress = ISNULL(@PickupAddress, PickupAddress),
            Phone = ISNULL(@Phone, Phone),
            LogoUrl = ISNULL(@LogoUrl, LogoUrl),
            BannerUrl = ISNULL(@BannerUrl, BannerUrl)
        OUTPUT INSERTED.*
        WHERE OwnerID = @OwnerID
      `);

    if (updated.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Bạn chưa có Gian hàng.' });
    }

    res.json({ success: true, message: 'Cập nhật thông tin Gian hàng thành công.', data: updated.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper kiểm tra user có Shop đã duyệt không
 */
const requireApprovedShop = async (pool, userId) => {
  const res = await pool
    .request()
    .input('OwnerID', sql.Int, userId)
    .query('SELECT * FROM dbo.Shops WHERE OwnerID = @OwnerID');
  if (res.recordset.length === 0) {
    const err = new Error('Bạn chưa đăng ký mở Gian hàng.');
    err.statusCode = 403;
    throw err;
  }
  const shop = res.recordset[0];
  if (shop.ApprovalStatus !== 'Approved') {
    const err = new Error(`Gian hàng của bạn hiện đang ở trạng thái "${shop.ApprovalStatus}", chưa thể thực hiện thao tác này.`);
    err.statusCode = 403;
    throw err;
  }
  return shop;
};

/**
 * GET /api/seller/books
 */
const getMyShopBooks = async (req, res, next) => {
  try {
    const pool = await getPool();
    const shopRes = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .query('SELECT ShopID FROM dbo.Shops WHERE OwnerID = @OwnerID');

    if (shopRes.recordset.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const shopId = shopRes.recordset[0].ShopID;
    const booksRes = await pool
      .request()
      .input('ShopID', sql.Int, shopId)
      .query(`
        SELECT
          b.*,
          p.PublisherName,
          STUFF((
            SELECT N', ' + a.AuthorName FROM dbo.BookAuthors ba
            INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
            WHERE ba.BookID = b.BookID FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS AuthorNames,
          STUFF((
            SELECT ',' + CAST(ba.AuthorID AS VARCHAR(10)) FROM dbo.BookAuthors ba WHERE ba.BookID = b.BookID FOR XML PATH('')
          ), 1, 1, '') AS AuthorIDs,
          STUFF((
            SELECT ',' + CAST(bc.CategoryID AS VARCHAR(10)) FROM dbo.BookCategories bc WHERE bc.BookID = b.BookID FOR XML PATH('')
          ), 1, 1, '') AS CategoryIDs
        FROM dbo.Books b
        LEFT JOIN dbo.Publishers p ON b.PublisherID = p.PublisherID
        WHERE b.ShopID = @ShopID
        ORDER BY b.CreatedAt DESC
      `);

    const formatted = booksRes.recordset.map((b) => ({
      ...b,
      galleryImages: safeJsonParse(b.GalleryImages, []),
      previewImages: safeJsonParse(b.PreviewImages, []),
      authorIds: b.AuthorIDs ? b.AuthorIDs.split(',').map(Number) : [],
      categoryIds: b.CategoryIDs ? b.CategoryIDs.split(',').map(Number) : [],
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/seller/books
 * Chủ Shop đăng bài bán sách mới -> Trạng thái mặc định 'Pending' chờ Manager đọc & duyệt!
 */
const createSellerBook = async (req, res, next) => {
  let transaction;
  try {
    const pool = await getPool();
    const shop = await requireApprovedShop(pool, req.user.userId);

    const {
      title, isbn, price, discountPrice, stock, description,
      coverImage, galleryImages = [], previewImages = [],
      pageCount, publicationYear, format, bookCondition, language,
      publisherId, authorIds = [], categoryIds = [],
    } = req.body;

    if (!title || !isbn || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Tên sách, mã ISBN và Giá bán.',
      });
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const finalCover = coverImage || (Array.isArray(galleryImages) && galleryImages[0]) || null;

    const insertRes = await new sql.Request(transaction)
      .input('ShopID', sql.Int, shop.ShopID)
      .input('SellerID', sql.Int, req.user.userId)
      .input('Title', sql.NVarChar(250), title.trim())
      .input('ISBN', sql.VarChar(30), isbn.trim())
      .input('Price', sql.Decimal(18, 2), parseFloat(price))
      .input('DiscountPrice', sql.Decimal(18, 2), discountPrice !== undefined && discountPrice !== '' && discountPrice !== null ? parseFloat(discountPrice) : null)
      .input('Stock', sql.Int, parseInt(stock || 1, 10))
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('CoverImage', sql.VarChar(500), finalCover)
      .input('GalleryImages', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(galleryImages) ? galleryImages : []))
      .input('PreviewImages', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(previewImages) ? previewImages : []))
      .input('PageCount', sql.Int, pageCount ? parseInt(pageCount, 10) : null)
      .input('PublicationYear', sql.Int, publicationYear ? parseInt(publicationYear, 10) : null)
      .input('Format', sql.NVarChar(50), format || 'Bìa mềm')
      .input('BookCondition', sql.NVarChar(60), bookCondition || 'Mới 100%')
      .input('Language', sql.NVarChar(50), language || 'Tiếng Việt')
      .input('PublisherID', sql.Int, publisherId ? parseInt(publisherId, 10) : null)
      .query(`
        INSERT INTO dbo.Books (
          ShopID, SellerID, Title, ISBN, Price, DiscountPrice, Stock, Description,
          CoverImage, GalleryImages, PreviewImages, PageCount, PublicationYear,
          Format, BookCondition, Language, PublisherID, ApprovalStatus
        )
        OUTPUT INSERTED.*
        VALUES (
          @ShopID, @SellerID, @Title, @ISBN, @Price, @DiscountPrice, @Stock, @Description,
          @CoverImage, @GalleryImages, @PreviewImages, @PageCount, @PublicationYear,
          @Format, @BookCondition, @Language, @PublisherID, N'Pending'
        )
      `);

    const created = insertRes.recordset[0];

    for (const authorId of [...new Set((authorIds || []).map(Number).filter(Boolean))]) {
      await new sql.Request(transaction)
        .input('BookID', sql.Int, created.BookID)
        .input('AuthorID', sql.Int, authorId)
        .query('INSERT INTO dbo.BookAuthors (BookID, AuthorID) VALUES (@BookID, @AuthorID)');
    }

    for (const categoryId of [...new Set((categoryIds || []).map(Number).filter(Boolean))]) {
      await new sql.Request(transaction)
        .input('BookID', sql.Int, created.BookID)
        .input('CategoryID', sql.Int, categoryId)
        .query('INSERT INTO dbo.BookCategories (BookID, CategoryID) VALUES (@BookID, @CategoryID)');
    }

    await transaction.commit();

    await notifyManagers(pool, {
      title: 'Bài đăng bán sách mới chờ duyệt',
      message: `Shop "${shop.ShopName}" vừa đăng bán cuốn "${title.trim()}". Vui lòng đọc kiểm tra và duyệt bài.`,
      type: 'Book',
      linkUrl: '/manager',
    });

    res.status(201).json({
      success: true,
      message: 'Đã gửi bài đăng bán sách thành công! Bài viết đang chờ Quản lý kiểm duyệt trước khi lên kệ.',
      data: created,
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * PUT /api/seller/books/:id
 * Chủ Shop sửa bài bán sách -> Nếu sửa nội dung (tiêu đề, mô tả, ảnh) hoặc đang bị Rejected -> chuyển lại Pending chờ duyệt!
 */
const updateSellerBook = async (req, res, next) => {
  let transaction;
  try {
    const bookId = parseInt(req.params.id, 10);
    const pool = await getPool();
    const shop = await requireApprovedShop(pool, req.user.userId);

    const existingRes = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .input('ShopID', sql.Int, shop.ShopID)
      .query('SELECT * FROM dbo.Books WHERE BookID = @BookID AND ShopID = @ShopID');

    if (existingRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuốn sách thuộc Gian hàng của bạn.' });
    }

    const old = existingRes.recordset[0];
    const {
      title, isbn, price, discountPrice, stock, description,
      coverImage, galleryImages, previewImages,
      pageCount, publicationYear, format, bookCondition,
      publisherId, authorIds, categoryIds,
    } = req.body;

    const contentChanged =
      (title && title.trim() !== old.Title) ||
      (description !== undefined && description !== old.Description) ||
      (coverImage && coverImage !== old.CoverImage) ||
      old.ApprovalStatus === 'Rejected';

    const nextStatus = contentChanged ? 'Pending' : old.ApprovalStatus;

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const updateRes = await new sql.Request(transaction)
      .input('BookID', sql.Int, bookId)
      .input('Title', sql.NVarChar(250), title ? title.trim() : old.Title)
      .input('ISBN', sql.VarChar(30), isbn ? isbn.trim() : old.ISBN)
      .input('Price', sql.Decimal(18, 2), price !== undefined ? parseFloat(price) : old.Price)
      .input('DiscountPrice', sql.Decimal(18, 2), discountPrice !== undefined && discountPrice !== '' && discountPrice !== null ? parseFloat(discountPrice) : null)
      .input('Stock', sql.Int, stock !== undefined ? parseInt(stock, 10) : old.Stock)
      .input('Description', sql.NVarChar(sql.MAX), description !== undefined ? description : old.Description)
      .input('CoverImage', sql.VarChar(500), coverImage !== undefined ? coverImage : old.CoverImage)
      .input('GalleryImages', sql.NVarChar(sql.MAX), galleryImages !== undefined ? JSON.stringify(galleryImages) : old.GalleryImages)
      .input('PreviewImages', sql.NVarChar(sql.MAX), previewImages !== undefined ? JSON.stringify(previewImages) : old.PreviewImages)
      .input('PageCount', sql.Int, pageCount ? parseInt(pageCount, 10) : old.PageCount)
      .input('PublicationYear', sql.Int, publicationYear ? parseInt(publicationYear, 10) : old.PublicationYear)
      .input('Format', sql.NVarChar(50), format || old.Format)
      .input('BookCondition', sql.NVarChar(60), bookCondition || old.BookCondition)
      .input('PublisherID', sql.Int, publisherId ? parseInt(publisherId, 10) : old.PublisherID)
      .input('ApprovalStatus', sql.NVarChar(20), nextStatus)
      .query(`
        UPDATE dbo.Books
        SET Title = @Title, ISBN = @ISBN, Price = @Price, DiscountPrice = @DiscountPrice,
            Stock = @Stock, Description = @Description, CoverImage = @CoverImage,
            GalleryImages = @GalleryImages, PreviewImages = @PreviewImages,
            PageCount = @PageCount, PublicationYear = @PublicationYear, Format = @Format,
            BookCondition = @BookCondition, PublisherID = @PublisherID,
            ApprovalStatus = @ApprovalStatus,
            RejectionReason = CASE WHEN @ApprovalStatus = N'Pending' THEN NULL ELSE RejectionReason END
        OUTPUT INSERTED.*
        WHERE BookID = @BookID
      `);

    if (Array.isArray(authorIds)) {
      await new sql.Request(transaction).input('BookID', sql.Int, bookId).query('DELETE FROM dbo.BookAuthors WHERE BookID = @BookID');
      for (const authorId of [...new Set(authorIds.map(Number).filter(Boolean))]) {
        await new sql.Request(transaction)
          .input('BookID', sql.Int, bookId)
          .input('AuthorID', sql.Int, authorId)
          .query('INSERT INTO dbo.BookAuthors (BookID, AuthorID) VALUES (@BookID, @AuthorID)');
      }
    }

    if (Array.isArray(categoryIds)) {
      await new sql.Request(transaction).input('BookID', sql.Int, bookId).query('DELETE FROM dbo.BookCategories WHERE BookID = @BookID');
      for (const categoryId of [...new Set(categoryIds.map(Number).filter(Boolean))]) {
        await new sql.Request(transaction)
          .input('BookID', sql.Int, bookId)
          .input('CategoryID', sql.Int, categoryId)
          .query('INSERT INTO dbo.BookCategories (BookID, CategoryID) VALUES (@BookID, @CategoryID)');
      }
    }

    await transaction.commit();

    if (nextStatus === 'Pending') {
      await notifyManagers(pool, {
        title: 'Bài đăng sách đã chỉnh sửa chờ duyệt lại',
        message: `Shop "${shop.ShopName}" đã cập nhật cuốn "${title || old.Title}" và gửi chờ duyệt lại.`,
        type: 'Book',
        linkUrl: '/manager',
      });
    }

    res.json({
      success: true,
      message: nextStatus === 'Pending'
        ? 'Đã cập nhật sách và gửi lại Quản lý kiểm duyệt.'
        : 'Đã cập nhật thông tin tồn kho/giá thành công.',
      data: updateRes.recordset[0],
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * PATCH /api/seller/books/:id/visibility
 * Ẩn hoặc hiện lại sách đã được duyệt
 */
const toggleSellerBookVisibility = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const pool = await getPool();
    const shop = await requireApprovedShop(pool, req.user.userId);

    const existing = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .input('ShopID', sql.Int, shop.ShopID)
      .query('SELECT ApprovalStatus FROM dbo.Books WHERE BookID = @BookID AND ShopID = @ShopID');

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sách.' });
    }

    const currentStatus = existing.recordset[0].ApprovalStatus;
    if (currentStatus !== 'Approved' && currentStatus !== 'Hidden') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể ẩn/hiện sách đã được Quản lý duyệt.' });
    }

    const nextStatus = currentStatus === 'Approved' ? 'Hidden' : 'Approved';
    await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .input('Status', sql.NVarChar(20), nextStatus)
      .query('UPDATE dbo.Books SET ApprovalStatus = @Status WHERE BookID = @BookID');

    res.json({
      success: true,
      message: nextStatus === 'Hidden' ? 'Đã tạm ẩn sách khỏi gian hàng.' : 'Đã mở bán lại sách.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/seller/wallet
 * Xem số dư Ví Shop và lịch sử đối soát hoa hồng / rút tiền
 */
const getMyShopWallet = async (req, res, next) => {
  try {
    const pool = await getPool();
    const shopRes = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .query('SELECT ShopID, ShopName, WalletBalance, PendingBalance FROM dbo.Shops WHERE OwnerID = @OwnerID');

    if (shopRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Bạn chưa có Gian hàng.' });
    }

    const shop = shopRes.recordset[0];
    const txRes = await pool
      .request()
      .input('ShopID', sql.Int, shop.ShopID)
      .query(`
        SELECT wt.*, u.FullName AS ProcessedByName
        FROM dbo.WalletTransactions wt
        LEFT JOIN dbo.Users u ON wt.ProcessedBy = u.UserID
        WHERE wt.ShopID = @ShopID
        ORDER BY wt.CreatedAt DESC
      `);

    const escrowRes = await pool
      .request()
      .input('ShopID', sql.Int, shop.ShopID)
      .query(`
        SELECT ISNULL(SUM(SellerNetAmount), 0) AS EscrowAmount
        FROM dbo.Orders
        WHERE ShopID = @ShopID AND IsSettled = 0 AND Status NOT IN (N'Cancelled', N'Refunded')
      `);

    res.json({
      success: true,
      data: {
        shopId: shop.ShopID,
        shopName: shop.ShopName,
        walletBalance: Number(shop.WalletBalance),
        escrowAmount: Number(escrowRes.recordset[0].EscrowAmount || 0),
        transactions: txRes.recordset,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/seller/wallet/withdraw
 * Chủ Shop gửi yêu cầu rút tiền từ Ví -> Admin duyệt
 */
const requestWithdrawal = async (req, res, next) => {
  let transaction;
  try {
    const { amount, bankInfo } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount < 50000) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền rút tối thiểu là 50.000đ.',
      });
    }
    if (!bankInfo || !bankInfo.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập thông tin tài khoản ngân hàng nhận tiền.',
      });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const shopRes = await new sql.Request(transaction)
      .input('OwnerID', sql.Int, req.user.userId)
      .query('SELECT ShopID, ShopName, WalletBalance FROM dbo.Shops WITH (UPDLOCK) WHERE OwnerID = @OwnerID AND ApprovalStatus = N\'Approved\'');

    if (shopRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: 'Không tìm thấy Gian hàng hợp lệ.' });
    }

    const shop = shopRes.recordset[0];
    if (Number(shop.WalletBalance) < withdrawAmount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Số dư khả dụng (${Number(shop.WalletBalance).toLocaleString('vi-VN')}đ) không đủ để rút.`,
      });
    }

    // Trừ tạm số dư để chống rút trùng, Admin từ chối sẽ hoàn lại
    await new sql.Request(transaction)
      .input('ShopID', sql.Int, shop.ShopID)
      .input('Amount', sql.Decimal(18, 2), withdrawAmount)
      .query('UPDATE dbo.Shops SET WalletBalance = WalletBalance - @Amount WHERE ShopID = @ShopID');

    const txInsert = await new sql.Request(transaction)
      .input('ShopID', sql.Int, shop.ShopID)
      .input('Amount', sql.Decimal(18, 2), withdrawAmount)
      .input('BankInfo', sql.NVarChar(300), bankInfo.trim())
      .input('Note', sql.NVarChar(500), `Yêu cầu rút tiền từ Shop ${shop.ShopName}`)
      .query(`
        INSERT INTO dbo.WalletTransactions (ShopID, Type, Amount, Status, BankInfo, Note)
        OUTPUT INSERTED.*
        VALUES (@ShopID, N'Withdrawal', @Amount, N'Pending', @BankInfo, @Note)
      `);

    await transaction.commit();

    // Thông báo cho Admin
    const admins = await pool.request().query("SELECT UserID FROM dbo.Users WHERE Role = N'Admin'");
    for (const a of admins.recordset) {
      await createNotification(pool, {
        userId: a.UserID,
        title: 'Yêu cầu rút tiền Ví Shop mới',
        message: `Shop "${shop.ShopName}" yêu cầu rút ${withdrawAmount.toLocaleString('vi-VN')}đ.`,
        type: 'Wallet',
        linkUrl: '/admin',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Đã gửi yêu cầu rút tiền! Quản trị viên sẽ duyệt và chuyển khoản trong thời gian sớm nhất.',
      data: txInsert.recordset[0],
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

module.exports = {
  getPublicShops,
  getShopById,
  registerShop,
  getMyShop,
  updateMyShop,
  getMyShopBooks,
  createSellerBook,
  updateSellerBook,
  toggleSellerBookVisibility,
  getMyShopWallet,
  requestWithdrawal,
};
