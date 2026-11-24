const { sql, getPool } = require('../config/db');

/**
 * Helper: đọc giỏ hàng từ dbo.CartItems kèm giá bán, Flash Sale & tồn kho thực tế mới nhất
 */
const fetchHydratedCart = async (pool, userId) => {
  const res = await pool
    .request()
    .input('UserID', sql.Int, userId)
    .query(`
      SELECT
        ci.BookID, ci.Quantity, ci.Selected, ci.UpdatedAt,
        b.ShopID, b.Title, b.ISBN, b.CoverImage, b.BookCondition,
        b.Price, b.DiscountPrice, b.Stock, b.ApprovalStatus,
        b.IsFlashSale, b.FlashSalePrice, b.FlashSaleEnd,
        s.ShopName, s.ApprovalStatus AS ShopStatus,
        STUFF((
          SELECT N', ' + a.AuthorName FROM dbo.BookAuthors ba
          INNER JOIN dbo.Authors a ON ba.AuthorID = a.AuthorID
          WHERE ba.BookID = b.BookID FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS AuthorNames
      FROM dbo.CartItems ci
      INNER JOIN dbo.Books b ON ci.BookID = b.BookID
      INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
      WHERE ci.UserID = @UserID
        AND b.ApprovalStatus = N'Approved'
        AND s.ApprovalStatus = N'Approved'
      ORDER BY ci.UpdatedAt DESC, ci.BookID ASC
    `);

  const now = new Date();
  return res.recordset.map((row) => {
    const isFlashActive =
      Boolean(row.IsFlashSale) &&
      row.FlashSalePrice !== null &&
      row.FlashSalePrice !== undefined &&
      (!row.FlashSaleEnd || new Date(row.FlashSaleEnd) > now);

    const unitPrice = isFlashActive
      ? Number(row.FlashSalePrice)
      : row.DiscountPrice !== null && row.DiscountPrice !== undefined
        ? Number(row.DiscountPrice)
        : Number(row.Price);

    const maxStock = Math.max(0, Number(row.Stock || 0));
    const safeQty = maxStock > 0 ? Math.min(Math.max(1, Number(row.Quantity || 1)), maxStock) : 1;

    return {
      bookId: row.BookID,
      shopId: row.ShopID,
      shopName: row.ShopName,
      title: row.Title,
      isbn: row.ISBN,
      coverImage: row.CoverImage,
      authorNames: row.AuthorNames,
      bookCondition: row.BookCondition || 'Mới 100%',
      price: Number(row.Price),
      unitPrice,
      stock: maxStock,
      quantity: safeQty,
      selected: maxStock > 0 ? Boolean(row.Selected) : false,
    };
  });
};

/**
 * GET /api/cart
 */
const getCart = async (req, res, next) => {
  try {
    const pool = await getPool();
    const items = await fetchHydratedCart(pool, req.user.userId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/cart/sync
 * Đồng bộ toàn bộ danh sách giỏ hàng lên DB (kèm gộp bookId trùng) & trả lại dữ liệu giá/tồn kho mới nhất
 */
const syncCart = async (req, res, next) => {
  let transaction;
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const merged = new Map();

    for (const item of rawItems) {
      const bookId = parseInt(item?.bookId, 10);
      const quantity = parseInt(item?.quantity, 10);
      if (!Number.isInteger(bookId) || bookId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
        continue;
      }
      const prev = merged.get(bookId);
      merged.set(bookId, {
        bookId,
        quantity: Math.min(99, (prev?.quantity || 0) + quantity),
        selected: item?.selected !== false,
      });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction)
      .input('UserID', sql.Int, req.user.userId)
      .query('DELETE FROM dbo.CartItems WHERE UserID = @UserID');

    for (const entry of merged.values()) {
      await new sql.Request(transaction)
        .input('UserID', sql.Int, req.user.userId)
        .input('BookID', sql.Int, entry.bookId)
        .input('Quantity', sql.Int, entry.quantity)
        .input('Selected', sql.Bit, entry.selected ? 1 : 0)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.Books WHERE BookID = @BookID AND ApprovalStatus = N'Approved')
          BEGIN
            INSERT INTO dbo.CartItems (UserID, BookID, Quantity, Selected)
            VALUES (@UserID, @BookID, @Quantity, @Selected);
          END
        `);
    }

    await transaction.commit();

    const hydrated = await fetchHydratedCart(pool, req.user.userId);
    res.json({ success: true, data: hydrated });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * DELETE /api/cart
 */
const clearServerCart = async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query('DELETE FROM dbo.CartItems WHERE UserID = @UserID');
    res.json({ success: true, message: 'Đã xóa giỏ hàng.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCart,
  syncCart,
  clearServerCart,
};
