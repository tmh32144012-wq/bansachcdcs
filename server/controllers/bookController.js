const { sql, getPool } = require('../config/db');
const { safeJsonParse } = require('../utils/helpers');

const formatBookRow = (book) => ({
  ...book,
  galleryImages: safeJsonParse(book.GalleryImages, []),
  previewImages: safeJsonParse(book.PreviewImages, []),
  authorIds: book.AuthorIDs ? book.AuthorIDs.split(',').map(Number) : [],
  categoryIds: book.CategoryIDs ? book.CategoryIDs.split(',').map(Number) : [],
  AvgRating: book.AvgRating ? Number(Number(book.AvgRating).toFixed(1)) : 0,
  ReviewCount: Number(book.ReviewCount || 0),
});

/**
 * GET /api/books
 * Danh sách sách công khai trên sàn (chỉ hiển thị sách ĐÃ DUYỆT và Shop ĐÃ DUYỆT)
 */
const getBooks = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '12', 10)));
    const offset = (page - 1) * limit;

    const { category, author, shopId, condition, minPrice, maxPrice, search, sort, flashSale } = req.query;

    const pool = await getPool();
    const request = pool.request();

    const conditions = ["b.ApprovalStatus = N'Approved'", "s.ApprovalStatus = N'Approved'"];

    if (category) {
      request.input('CategoryID', sql.Int, parseInt(category, 10));
      conditions.push(`
        EXISTS (
          SELECT 1 FROM dbo.BookCategories bc
          WHERE bc.BookID = b.BookID AND bc.CategoryID = @CategoryID
        )
      `);
    }

    if (author) {
      request.input('AuthorID', sql.Int, parseInt(author, 10));
      conditions.push(`
        EXISTS (
          SELECT 1 FROM dbo.BookAuthors ba
          WHERE ba.BookID = b.BookID AND ba.AuthorID = @AuthorID
        )
      `);
    }

    if (shopId) {
      request.input('ShopID', sql.Int, parseInt(shopId, 10));
      conditions.push('b.ShopID = @ShopID');
    }

    if (condition) {
      request.input('BookCondition', sql.NVarChar(60), condition);
      conditions.push('b.BookCondition = @BookCondition');
    }

    if (flashSale === 'true' || flashSale === '1') {
      conditions.push('b.IsFlashSale = 1 AND (b.FlashSaleEnd IS NULL OR b.FlashSaleEnd > SYSDATETIME())');
    }

    const effectivePriceExpr = `
      CASE
        WHEN b.IsFlashSale = 1 AND b.FlashSalePrice IS NOT NULL AND (b.FlashSaleEnd IS NULL OR b.FlashSaleEnd > SYSDATETIME())
          THEN b.FlashSalePrice
        ELSE ISNULL(b.DiscountPrice, b.Price)
      END
    `;

    if (minPrice !== undefined && minPrice !== '') {
      request.input('MinPrice', sql.Decimal(18, 2), parseFloat(minPrice));
      conditions.push(`(${effectivePriceExpr}) >= @MinPrice`);
    }

    if (maxPrice !== undefined && maxPrice !== '') {
      request.input('MaxPrice', sql.Decimal(18, 2), parseFloat(maxPrice));
      conditions.push(`(${effectivePriceExpr}) <= @MaxPrice`);
    }

    if (search && search.trim() !== '') {
      request.input('Search', sql.NVarChar(250), `%${search.trim()}%`);
      conditions.push(`(
        b.Title LIKE @Search
        OR b.ISBN LIKE @Search
        OR s.ShopName LIKE @Search
        OR EXISTS (
          SELECT 1 FROM dbo.BookAuthors ba
          INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
          WHERE ba.BookID = b.BookID AND a.AuthorName LIKE @Search
        )
      )`);
    }

    const whereClause = conditions.join(' AND ');

    let orderByClause = 'b.CreatedAt DESC, b.BookID DESC';
    if (sort === 'price_asc') {
      orderByClause = `(${effectivePriceExpr}) ASC`;
    } else if (sort === 'price_desc') {
      orderByClause = `(${effectivePriceExpr}) DESC`;
    } else if (sort === 'bestselling') {
      orderByClause = 'b.SoldCount DESC, b.BookID DESC';
    } else if (sort === 'title_asc') {
      orderByClause = 'b.Title ASC';
    }

    request.input('Offset', sql.Int, offset);
    request.input('Limit', sql.Int, limit);

    const query = `
      SELECT COUNT(*) AS TotalCount
      FROM dbo.Books b
      INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
      WHERE ${whereClause};

      SELECT
        b.BookID, b.ShopID, b.SellerID, b.Title, b.ISBN, b.Price, b.DiscountPrice,
        b.Stock, b.SoldCount, b.Description, b.CoverImage, b.GalleryImages, b.PreviewImages,
        b.PageCount, b.PublicationYear, b.Format, b.BookCondition, b.Language,
        b.PublisherID, p.PublisherName, b.ApprovalStatus,
        b.IsFlashSale, b.FlashSalePrice, b.FlashSaleEnd, b.CreatedAt,
        s.ShopName, s.ShopType, s.LogoUrl AS ShopLogo, s.PickupAddress AS ShopAddress,
        (SELECT AVG(CAST(r.Rating AS FLOAT)) FROM dbo.Reviews r WHERE r.BookID = b.BookID AND r.Status = N'Visible') AS AvgRating,
        (SELECT COUNT(*) FROM dbo.Reviews r WHERE r.BookID = b.BookID AND r.Status = N'Visible') AS ReviewCount,
        STUFF((
          SELECT N', ' + a.AuthorName
          FROM dbo.BookAuthors ba
          INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
          WHERE ba.BookID = b.BookID
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS AuthorNames,
        STUFF((
          SELECT N', ' + c.CategoryName
          FROM dbo.BookCategories bc
          INNER JOIN dbo.Categories c ON bc.CategoryID = c.CategoryID
          WHERE bc.BookID = b.BookID
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS CategoryNames,
        STUFF((
          SELECT ',' + CAST(ba.AuthorID AS VARCHAR(10))
          FROM dbo.BookAuthors ba
          WHERE ba.BookID = b.BookID
          FOR XML PATH('')
        ), 1, 1, '') AS AuthorIDs,
        STUFF((
          SELECT ',' + CAST(bc.CategoryID AS VARCHAR(10))
          FROM dbo.BookCategories bc
          WHERE bc.BookID = b.BookID
          FOR XML PATH('')
        ), 1, 1, '') AS CategoryIDs
      FROM dbo.Books b
      INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
      LEFT JOIN dbo.Publishers p ON b.PublisherID = p.PublisherID
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `;

    const result = await request.query(query);
    const totalItems = result.recordsets[0][0].TotalCount;
    const books = result.recordsets[1].map(formatBookRow);

    res.json({
      success: true,
      data: books,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/books/:id
 * Chi tiết 1 cuốn sách kèm thông tin Shop, đánh giá, ảnh đọc thử, số người theo dõi Shop
 */
const getBookById = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    if (isNaN(bookId)) {
      return res.status(400).json({ success: false, message: 'ID sách không hợp lệ.' });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .query(`
        SELECT
          b.*,
          p.PublisherName,
          s.ShopName, s.ShopType, s.LogoUrl AS ShopLogo, s.Description AS ShopDescription,
          s.PickupAddress AS ShopAddress, s.OwnerID AS ShopOwnerID,
          (SELECT COUNT(*) FROM dbo.ShopFollowers sf WHERE sf.ShopID = s.ShopID) AS ShopFollowerCount,
          (SELECT COUNT(*) FROM dbo.Books sb WHERE sb.ShopID = s.ShopID AND sb.ApprovalStatus = N'Approved') AS ShopBookCount,
          (SELECT AVG(CAST(r.Rating AS FLOAT)) FROM dbo.Reviews r WHERE r.BookID = b.BookID AND r.Status = N'Visible') AS AvgRating,
          (SELECT COUNT(*) FROM dbo.Reviews r WHERE r.BookID = b.BookID AND r.Status = N'Visible') AS ReviewCount
        FROM dbo.Books b
        INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
        LEFT JOIN dbo.Publishers p ON b.PublisherID = p.PublisherID
        WHERE b.BookID = @BookID;

        SELECT a.AuthorID, a.AuthorName, a.Bio
        FROM dbo.BookAuthors ba
        INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
        WHERE ba.BookID = @BookID;

        SELECT c.CategoryID, c.CategoryName, c.ParentID
        FROM dbo.BookCategories bc
        INNER JOIN dbo.Categories c ON bc.CategoryID = c.CategoryID
        WHERE bc.BookID = @BookID;

        SELECT
          r.ReviewID, r.Rating, r.Comment, r.Images, r.SellerReply, r.SellerRepliedAt, r.CreatedAt,
          u.FullName AS ReviewerName, u.UserID AS ReviewerID
        FROM dbo.Reviews r
        INNER JOIN dbo.Users u ON r.UserID = u.UserID
        WHERE r.BookID = @BookID AND r.Status = N'Visible'
        ORDER BY r.CreatedAt DESC;

        SELECT TOP 4
          v.VoucherID, v.Code, v.Title, v.DiscountType, v.DiscountValue, v.MaxDiscount, v.MinOrderValue, v.EndDate
        FROM dbo.Vouchers v
        INNER JOIN dbo.Books b ON b.ShopID = v.ShopID
        WHERE b.BookID = @BookID AND v.Scope = N'Shop' AND v.IsActive = 1
          AND v.EndDate > SYSDATETIME() AND v.UsedCount < v.UsageLimit;
      `);

    if (result.recordsets[0].length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuốn sách này.' });
    }

    const book = result.recordsets[0][0];
    const authors = result.recordsets[1];
    const categories = result.recordsets[2];
    const reviews = result.recordsets[3].map((r) => ({
      ...r,
      images: safeJsonParse(r.Images, []),
    }));
    const shopVouchers = result.recordsets[4];

    res.json({
      success: true,
      data: {
        ...formatBookRow(book),
        authors,
        categories,
        reviews,
        shopVouchers,
        AuthorNames: authors.map((a) => a.AuthorName).join(', '),
        CategoryNames: categories.map((c) => c.CategoryName).join(', '),
        authorIds: authors.map((a) => a.AuthorID),
        categoryIds: categories.map((c) => c.CategoryID),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/books (Admin / Manager đăng trực tiếp cho VitaBook Mall - Tự động Approved)
 */
const createBook = async (req, res, next) => {
  let transaction;
  try {
    const {
      title, isbn, price, discountPrice, stock, description,
      coverImage, galleryImages = [], previewImages = [],
      pageCount, publicationYear, format, bookCondition, language,
      publisherId, shopId, authorIds = [], categoryIds = [],
      isFlashSale = false, flashSalePrice = null, flashSaleEnd = null,
    } = req.body;

    if (!title || !isbn || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Tên sách, mã ISBN và Giá bán.',
      });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Mặc định gắn vào VitaBook Mall (ShopID = 1) nếu Admin không chọn shop khác
    let targetShopId = shopId ? parseInt(shopId, 10) : 1;
    const shopRes = await new sql.Request(transaction)
      .input('ShopID', sql.Int, targetShopId)
      .query('SELECT ShopID, OwnerID FROM dbo.Shops WHERE ShopID = @ShopID');

    if (shopRes.recordset.length === 0) {
      const firstShop = await new sql.Request(transaction).query('SELECT TOP 1 ShopID, OwnerID FROM dbo.Shops ORDER BY ShopID ASC');
      if (firstShop.recordset.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Chưa có Gian hàng nào trong hệ thống.' });
      }
      targetShopId = firstShop.recordset[0].ShopID;
    }

    const insertBookResult = await new sql.Request(transaction)
      .input('ShopID', sql.Int, targetShopId)
      .input('SellerID', sql.Int, req.user.userId)
      .input('Title', sql.NVarChar(250), title.trim())
      .input('ISBN', sql.VarChar(30), isbn.trim())
      .input('Price', sql.Decimal(18, 2), parseFloat(price))
      .input('DiscountPrice', sql.Decimal(18, 2), discountPrice !== undefined && discountPrice !== '' && discountPrice !== null ? parseFloat(discountPrice) : null)
      .input('Stock', sql.Int, parseInt(stock || 0, 10))
      .input('Description', sql.NVarChar(sql.MAX), description || null)
      .input('CoverImage', sql.VarChar(500), coverImage || (Array.isArray(galleryImages) && galleryImages[0]) || null)
      .input('GalleryImages', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(galleryImages) ? galleryImages : []))
      .input('PreviewImages', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(previewImages) ? previewImages : []))
      .input('PageCount', sql.Int, pageCount ? parseInt(pageCount, 10) : null)
      .input('PublicationYear', sql.Int, publicationYear ? parseInt(publicationYear, 10) : null)
      .input('Format', sql.NVarChar(50), format || 'Bìa mềm')
      .input('BookCondition', sql.NVarChar(60), bookCondition || 'Mới 100%')
      .input('Language', sql.NVarChar(50), language || 'Tiếng Việt')
      .input('PublisherID', sql.Int, publisherId ? parseInt(publisherId, 10) : null)
      .input('ApprovalStatus', sql.NVarChar(20), 'Approved')
      .input('ReviewedBy', sql.Int, req.user.userId)
      .input('IsFlashSale', sql.Bit, isFlashSale ? 1 : 0)
      .input('FlashSalePrice', sql.Decimal(18, 2), flashSalePrice ? parseFloat(flashSalePrice) : null)
      .input('FlashSaleEnd', sql.DateTime2, flashSaleEnd ? new Date(flashSaleEnd) : null)
      .query(`
        INSERT INTO dbo.Books (
          ShopID, SellerID, Title, ISBN, Price, DiscountPrice, Stock, Description,
          CoverImage, GalleryImages, PreviewImages, PageCount, PublicationYear,
          Format, BookCondition, Language, PublisherID, ApprovalStatus, ReviewedBy, ReviewedAt,
          IsFlashSale, FlashSalePrice, FlashSaleEnd
        )
        OUTPUT INSERTED.*
        VALUES (
          @ShopID, @SellerID, @Title, @ISBN, @Price, @DiscountPrice, @Stock, @Description,
          @CoverImage, @GalleryImages, @PreviewImages, @PageCount, @PublicationYear,
          @Format, @BookCondition, @Language, @PublisherID, @ApprovalStatus, @ReviewedBy, SYSDATETIME(),
          @IsFlashSale, @FlashSalePrice, @FlashSaleEnd
        )
      `);

    const createdBook = insertBookResult.recordset[0];
    const bookId = createdBook.BookID;

    for (const authorId of [...new Set((authorIds || []).map(Number).filter(Boolean))]) {
      await new sql.Request(transaction)
        .input('BookID', sql.Int, bookId)
        .input('AuthorID', sql.Int, authorId)
        .query('INSERT INTO dbo.BookAuthors (BookID, AuthorID) VALUES (@BookID, @AuthorID)');
    }

    for (const categoryId of [...new Set((categoryIds || []).map(Number).filter(Boolean))]) {
      await new sql.Request(transaction)
        .input('BookID', sql.Int, bookId)
        .input('CategoryID', sql.Int, categoryId)
        .query('INSERT INTO dbo.BookCategories (BookID, CategoryID) VALUES (@BookID, @CategoryID)');
    }

    await transaction.commit();
    res.status(201).json({ success: true, message: 'Thêm sách mới thành công.', data: createdBook });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * PUT /api/books/:id (Admin / Manager)
 */
const updateBook = async (req, res, next) => {
  let transaction;
  try {
    const bookId = parseInt(req.params.id, 10);
    const {
      title, isbn, price, discountPrice, stock, description,
      coverImage, galleryImages, previewImages,
      pageCount, publicationYear, format, bookCondition, language,
      publisherId, authorIds, categoryIds,
      isFlashSale, flashSalePrice, flashSaleEnd,
    } = req.body;

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const existing = await new sql.Request(transaction)
      .input('BookID', sql.Int, bookId)
      .query('SELECT * FROM dbo.Books WHERE BookID = @BookID');

    if (existing.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy sách cần cập nhật.' });
    }

    const old = existing.recordset[0];

    const updateResult = await new sql.Request(transaction)
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
      .input('Language', sql.NVarChar(50), language || old.Language)
      .input('PublisherID', sql.Int, publisherId ? parseInt(publisherId, 10) : old.PublisherID)
      .input('IsFlashSale', sql.Bit, isFlashSale !== undefined ? (isFlashSale ? 1 : 0) : old.IsFlashSale)
      .input('FlashSalePrice', sql.Decimal(18, 2), flashSalePrice !== undefined ? (flashSalePrice ? parseFloat(flashSalePrice) : null) : old.FlashSalePrice)
      .input('FlashSaleEnd', sql.DateTime2, flashSaleEnd !== undefined ? (flashSaleEnd ? new Date(flashSaleEnd) : null) : old.FlashSaleEnd)
      .query(`
        UPDATE dbo.Books
        SET
          Title = @Title, ISBN = @ISBN, Price = @Price, DiscountPrice = @DiscountPrice,
          Stock = @Stock, Description = @Description, CoverImage = @CoverImage,
          GalleryImages = @GalleryImages, PreviewImages = @PreviewImages,
          PageCount = @PageCount, PublicationYear = @PublicationYear, Format = @Format,
          BookCondition = @BookCondition, Language = @Language, PublisherID = @PublisherID,
          IsFlashSale = @IsFlashSale, FlashSalePrice = @FlashSalePrice, FlashSaleEnd = @FlashSaleEnd
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
    res.json({ success: true, message: 'Cập nhật thông tin sách thành công.', data: updateResult.recordset[0] });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * DELETE /api/books/:id (Admin)
 */
const deleteBook = async (req, res, next) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const orderCheck = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .query('SELECT TOP 1 OrderDetailID FROM dbo.OrderDetails WHERE BookID = @BookID');

    if (orderCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa sách đã có trong lịch sử đơn hàng. Bạn có thể ẩn hoặc đặt tồn kho về 0.',
      });
    }

    const result = await pool
      .request()
      .input('BookID', sql.Int, bookId)
      .query('DELETE FROM dbo.Books WHERE BookID = @BookID');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sách cần xóa.' });
    }

    res.json({ success: true, message: 'Đã xóa sách thành công.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
};
