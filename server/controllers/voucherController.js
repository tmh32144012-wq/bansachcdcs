const { sql, getPool } = require('../config/db');

/**
 * GET /api/vouchers
 * Lấy danh sách voucher đang hoạt động (có thể lọc theo scope hoặc shopId)
 */
const getActiveVouchers = async (req, res, next) => {
  try {
    const { scope, shopId, includeAll } = req.query;
    const pool = await getPool();
    const request = pool.request();
    const conditions = ['1 = 1'];

    if (!includeAll) {
      conditions.push('v.IsActive = 1 AND v.EndDate > SYSDATETIME() AND v.UsedCount < v.UsageLimit');
    }
    if (scope) {
      request.input('Scope', sql.NVarChar(20), scope);
      conditions.push('v.Scope = @Scope');
    }
    if (shopId) {
      request.input('ShopID', sql.Int, parseInt(shopId, 10));
      conditions.push('v.ShopID = @ShopID');
    }

    const resData = await request.query(`
      SELECT v.*, s.ShopName
      FROM dbo.Vouchers v
      LEFT JOIN dbo.Shops s ON v.ShopID = s.ShopID
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.Scope ASC, v.VoucherID DESC
    `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/vouchers
 * Manager/Admin tạo Voucher Sàn hoặc Freeship; Seller tạo Voucher riêng cho Shop của mình
 */
const createVoucher = async (req, res, next) => {
  try {
    const {
      code, title, scope = 'Shop', discountType = 'Fixed',
      discountValue, maxDiscount = null, minOrderValue = 0,
      usageLimit = 100, endDate,
    } = req.body;

    if (!code || !title || !discountValue || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập Mã voucher, Tiêu đề, Giá trị giảm và Ngày hết hạn.',
      });
    }

    const pool = await getPool();
    let targetShopId = null;
    let finalScope = scope;

    if (req.user.role === 'Customer') {
      const shopRes = await pool
        .request()
        .input('OwnerID', sql.Int, req.user.userId)
        .query("SELECT ShopID FROM dbo.Shops WHERE OwnerID = @OwnerID AND ApprovalStatus = N'Approved'");
      if (shopRes.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'Bạn cần có Gian hàng đã được duyệt để tạo Voucher Shop.' });
      }
      targetShopId = shopRes.recordset[0].ShopID;
      finalScope = 'Shop';
    } else if (finalScope === 'Shop' && req.body.shopId) {
      targetShopId = parseInt(req.body.shopId, 10);
    }

    const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '');
    const exists = await pool
      .request()
      .input('Code', sql.VarChar(50), normalizedCode)
      .query('SELECT VoucherID FROM dbo.Vouchers WHERE Code = @Code');

    if (exists.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Mã Voucher này đã tồn tại.' });
    }

    const inserted = await pool
      .request()
      .input('Code', sql.VarChar(50), normalizedCode)
      .input('Title', sql.NVarChar(150), title.trim())
      .input('Scope', sql.NVarChar(20), finalScope)
      .input('ShopID', sql.Int, targetShopId)
      .input('DiscountType', sql.NVarChar(20), discountType)
      .input('DiscountValue', sql.Decimal(18, 2), parseFloat(discountValue))
      .input('MaxDiscount', sql.Decimal(18, 2), maxDiscount ? parseFloat(maxDiscount) : null)
      .input('MinOrderValue', sql.Decimal(18, 2), parseFloat(minOrderValue || 0))
      .input('UsageLimit', sql.Int, parseInt(usageLimit || 100, 10))
      .input('EndDate', sql.DateTime2, new Date(endDate))
      .input('CreatedBy', sql.Int, req.user.userId)
      .query(`
        INSERT INTO dbo.Vouchers (
          Code, Title, Scope, ShopID, DiscountType, DiscountValue, MaxDiscount,
          MinOrderValue, UsageLimit, EndDate, CreatedBy
        )
        OUTPUT INSERTED.*
        VALUES (
          @Code, @Title, @Scope, @ShopID, @DiscountType, @DiscountValue, @MaxDiscount,
          @MinOrderValue, @UsageLimit, @EndDate, @CreatedBy
        )
      `);

    res.status(201).json({ success: true, message: 'Tạo mã khuyến mãi thành công!', data: inserted.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/vouchers/:id
 */
const deleteVoucher = async (req, res, next) => {
  try {
    const voucherId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const vRes = await pool
      .request()
      .input('VoucherID', sql.Int, voucherId)
      .query('SELECT * FROM dbo.Vouchers WHERE VoucherID = @VoucherID');

    if (vRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Voucher.' });
    }

    const voucher = vRes.recordset[0];
    if (req.user.role === 'Customer' && voucher.CreatedBy !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa Voucher này.' });
    }

    await pool.request().input('VoucherID', sql.Int, voucherId).query('DELETE FROM dbo.Vouchers WHERE VoucherID = @VoucherID');
    res.json({ success: true, message: 'Đã xóa Voucher.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveVouchers,
  createVoucher,
  deleteVoucher,
};
