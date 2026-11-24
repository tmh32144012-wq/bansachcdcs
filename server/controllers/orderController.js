const crypto = require('crypto');
const { sql, getPool } = require('../config/db');
const { getSystemSetting, createNotification, pushToUser } = require('../utils/helpers');
const { getQrScanBaseUrls } = require('../utils/networkHelper');

/**
 * Gộp các dòng sách trùng bookId trong giỏ hàng gửi lên & kiểm tra tính hợp lệ
 */
const mergeOrderItems = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { valid: false, message: 'Giỏ hàng trống. Vui lòng chọn ít nhất 1 cuốn sách.' };
  }

  const mergedMap = new Map();
  for (const item of rawItems) {
    const bookId = parseInt(item?.bookId, 10);
    const quantity = parseInt(item?.quantity, 10);
    if (!Number.isInteger(bookId) || bookId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return { valid: false, message: 'Số lượng hoặc mã sách đặt mua không hợp lệ.' };
    }
    mergedMap.set(bookId, (mergedMap.get(bookId) || 0) + quantity);
  }

  return {
    valid: true,
    items: Array.from(mergedMap.entries()).map(([bookId, quantity]) => ({ bookId, quantity })),
  };
};

/**
 * Hoàn lại lượt sử dụng Voucher (UsedCount) khi đơn hàng bị hủy
 */
const refundOrderVouchers = async (transaction, order) => {
  const codes = [order.ShopVoucherCode, order.PlatformVoucherCode].filter(Boolean);
  for (const code of codes) {
    await new sql.Request(transaction)
      .input('Code', sql.VarChar(50), code)
      .query(`
        UPDATE dbo.Vouchers
        SET UsedCount = CASE WHEN UsedCount > 0 THEN UsedCount - 1 ELSE 0 END
        WHERE Code = @Code
      `);
  }
};

const calcVoucherDiscount = (voucher, baseAmount) => {
  if (!voucher) return 0;
  if (baseAmount < Number(voucher.MinOrderValue || 0)) return 0;
  let discount = 0;
  if (voucher.DiscountType === 'Percent') {
    discount = (baseAmount * Number(voucher.DiscountValue)) / 100;
    if (voucher.MaxDiscount) {
      discount = Math.min(discount, Number(voucher.MaxDiscount));
    }
  } else {
    discount = Number(voucher.DiscountValue);
  }
  return Math.min(Math.round(discount), baseAmount);
};

/**
 * POST /api/orders
 * Đặt hàng đa gian hàng (Multi-Vendor Split Checkout):
 * - Tự động tách đơn hàng theo từng ShopID (giống Shopee)
 * - Hỗ trợ thanh toán trước (Prepaid - Escrow) hoặc nhận hàng rồi mới thanh toán (COD)
 * - Áp dụng phí vận chuyển + Voucher 2 tầng (Voucher Shop & Voucher Sàn / Freeship)
 * - Trừ kho với UPDLOCK, ROWLOCK + khởi tạo OrderTrackingEvents đầu tiên
 */
const createOrder = async (req, res, next) => {
  let transaction;
  try {
    const {
      items,
      shippingAddress,
      phone,
      note = '',
      shippingMethod = 'Standard',
      paymentType = 'COD', // 'COD' | 'Prepaid'
      paymentMethod = 'COD', // 'COD' | 'VIETQR' | 'AGRIBANK' | 'MOMO' | 'ZALOPAY'
      platformVoucherCode = null,
      shopVoucherCodes = {}, // { [shopId]: 'CODE' }
    } = req.body;

    const userId = req.user.userId;

    const mergedCheck = mergeOrderItems(items);
    if (!mergedCheck.valid) {
      return res.status(400).json({ success: false, message: mergedCheck.message });
    }
    const normalizedItems = mergedCheck.items;

    if (!shippingAddress || !shippingAddress.trim() || !phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ địa chỉ giao hàng và số điện thoại.',
      });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

    const commissionRate = parseFloat(await getSystemSetting(transaction, 'CommissionRate', '5'));
    const feeKey =
      shippingMethod === 'Economy'
        ? 'ShippingFeeEconomy'
        : shippingMethod === 'Express'
          ? 'ShippingFeeExpress'
          : 'ShippingFeeStandard';
    const baseShippingFee = parseFloat(await getSystemSetting(transaction, feeKey, '30000'));

    // Bước 1: Kiểm tra tồn kho, khóa dòng và gom nhóm sách theo từng ShopID
    const groupedByShop = new Map();

    for (const item of normalizedItems) {
      const { bookId, quantity } = item;

      const bookRes = await new sql.Request(transaction)
        .input('BookID', sql.Int, bookId)
        .query(`
          SELECT b.BookID, b.ShopID, b.Title, b.Price, b.DiscountPrice, b.Stock,
                 b.ApprovalStatus, b.IsFlashSale, b.FlashSalePrice, b.FlashSaleEnd,
                 s.ShopName, s.OwnerID AS ShopOwnerID, s.ApprovalStatus AS ShopStatus
          FROM dbo.Books b WITH (UPDLOCK, ROWLOCK)
          INNER JOIN dbo.Shops s ON b.ShopID = s.ShopID
          WHERE b.BookID = @BookID
        `);

      if (bookRes.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: `Không tìm thấy sách #${bookId}.` });
      }

      const book = bookRes.recordset[0];
      if (book.ApprovalStatus !== 'Approved' || book.ShopStatus !== 'Approved') {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: `Sách "${book.Title}" hiện chưa được mở bán.` });
      }

      if (Number(book.ShopOwnerID) === Number(userId)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Bạn không thể tự đặt mua sách "${book.Title}" từ chính Gian hàng của mình.`,
        });
      }

      if (book.Stock < quantity) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Sách "${book.Title}" chỉ còn ${book.Stock} cuốn trong kho.`,
        });
      }

      await new sql.Request(transaction)
        .input('BookID', sql.Int, bookId)
        .input('Quantity', sql.Int, quantity)
        .query('UPDATE dbo.Books SET Stock = Stock - @Quantity, SoldCount = SoldCount + @Quantity WHERE BookID = @BookID');

      const isFlashActive =
        book.IsFlashSale &&
        book.FlashSalePrice !== null &&
        (!book.FlashSaleEnd || new Date(book.FlashSaleEnd) > new Date());

      const unitPrice = isFlashActive
        ? Number(book.FlashSalePrice)
        : book.DiscountPrice !== null && book.DiscountPrice !== undefined
          ? Number(book.DiscountPrice)
          : Number(book.Price);

      if (!groupedByShop.has(book.ShopID)) {
        groupedByShop.set(book.ShopID, {
          shopId: book.ShopID,
          shopName: book.ShopName,
          shopOwnerId: book.ShopOwnerID,
          items: [],
          subtotal: 0,
        });
      }
      const group = groupedByShop.get(book.ShopID);
      group.items.push({ bookId, title: book.Title, unitPrice, quantity });
      group.subtotal += unitPrice * quantity;
    }

    // Bước 2: Kiểm tra Voucher Sàn / Freeship (nếu có)
    let platformVoucher = null;
    if (platformVoucherCode && platformVoucherCode.trim()) {
      const pvRes = await new sql.Request(transaction)
        .input('Code', sql.VarChar(50), platformVoucherCode.trim().toUpperCase())
        .query(`
          SELECT * FROM dbo.Vouchers WITH (UPDLOCK)
          WHERE Code = @Code AND Scope IN (N'Platform', N'Freeship')
            AND IsActive = 1 AND EndDate > SYSDATETIME() AND UsedCount < UsageLimit
        `);
      if (pvRes.recordset.length > 0) {
        platformVoucher = pvRes.recordset[0];
      }
    }

    const groupEntropy = crypto.randomBytes(3).toString('hex').toUpperCase();
    const orderGroupCode = `GRP-${Date.now().toString().slice(-6)}-${groupEntropy}`;
    const isPrepaid = paymentType === 'Prepaid' || ['VIETQR', 'AGRIBANK', 'MOMO', 'ZALOPAY', 'BANK_TRANSFER'].includes(paymentMethod);
    const normalizedPaymentType = isPrepaid ? 'Prepaid' : 'COD';
    // Đơn thanh toán trước khởi tạo ở trạng thái Unpaid (chờ quét mã QR -> tự chuyển sang Escrow)
    const paymentStatus = 'Unpaid';

    const createdOrders = [];
    const shopGroups = Array.from(groupedByShop.values());
    let platformVoucherApplied = false;

    // Bước 3: Tạo đơn hàng riêng cho từng Shop
    for (const group of shopGroups) {
      let shopDiscount = 0;
      let appliedShopCode = null;
      const requestedShopCode = shopVoucherCodes?.[group.shopId] || shopVoucherCodes?.[String(group.shopId)];

      if (requestedShopCode && requestedShopCode.trim()) {
        const svRes = await new sql.Request(transaction)
          .input('Code', sql.VarChar(50), requestedShopCode.trim().toUpperCase())
          .input('ShopID', sql.Int, group.shopId)
          .query(`
            SELECT * FROM dbo.Vouchers WITH (UPDLOCK)
            WHERE Code = @Code AND Scope = N'Shop' AND ShopID = @ShopID
              AND IsActive = 1 AND EndDate > SYSDATETIME() AND UsedCount < UsageLimit
          `);
        if (svRes.recordset.length > 0) {
          const sv = svRes.recordset[0];
          shopDiscount = calcVoucherDiscount(sv, group.subtotal);
          if (shopDiscount > 0) {
            appliedShopCode = sv.Code;
            await new sql.Request(transaction)
              .input('VoucherID', sql.Int, sv.VoucherID)
              .query('UPDATE dbo.Vouchers SET UsedCount = UsedCount + 1 WHERE VoucherID = @VoucherID');
          }
        }
      }

      let platformDiscount = 0;
      let appliedPlatformCode = null;
      let shippingFee = baseShippingFee;

      if (platformVoucher && !platformVoucherApplied) {
        if (platformVoucher.Scope === 'Freeship') {
          if (group.subtotal >= Number(platformVoucher.MinOrderValue || 0)) {
            platformDiscount = Math.min(Number(platformVoucher.DiscountValue), shippingFee);
            appliedPlatformCode = platformVoucher.Code;
            platformVoucherApplied = true;
          }
        } else {
          platformDiscount = calcVoucherDiscount(platformVoucher, group.subtotal - shopDiscount);
          if (platformDiscount > 0) {
            appliedPlatformCode = platformVoucher.Code;
            platformVoucherApplied = true;
          }
        }
      }

      const netGoodsAmount = Math.max(0, group.subtotal - shopDiscount);
      const totalAmount = Math.max(0, netGoodsAmount + shippingFee - platformDiscount);
      const commissionAmount = Math.round((netGoodsAmount * commissionRate) / 100);
      const sellerNetAmount = Math.max(0, netGoodsAmount - commissionAmount);
      const trackingEntropy = crypto.randomBytes(3).toString('hex').toUpperCase();
      const trackingNumber = `VBX-${Date.now().toString().slice(-6)}-${group.shopId}-${trackingEntropy}`;

      const orderRes = await new sql.Request(transaction)
        .input('OrderGroupCode', sql.VarChar(50), orderGroupCode)
        .input('UserID', sql.Int, userId)
        .input('ShopID', sql.Int, group.shopId)
        .input('Subtotal', sql.Decimal(18, 2), group.subtotal)
        .input('ShippingFee', sql.Decimal(18, 2), shippingFee)
        .input('ShippingMethod', sql.NVarChar(50), shippingMethod)
        .input('ShopDiscount', sql.Decimal(18, 2), shopDiscount)
        .input('PlatformDiscount', sql.Decimal(18, 2), platformDiscount)
        .input('ShopVoucherCode', sql.VarChar(50), appliedShopCode)
        .input('PlatformVoucherCode', sql.VarChar(50), appliedPlatformCode)
        .input('TotalAmount', sql.Decimal(18, 2), totalAmount)
        .input('CommissionRate', sql.Decimal(5, 2), commissionRate)
        .input('CommissionAmount', sql.Decimal(18, 2), commissionAmount)
        .input('SellerNetAmount', sql.Decimal(18, 2), sellerNetAmount)
        .input('ShippingAddress', sql.NVarChar(500), shippingAddress.trim())
        .input('Phone', sql.VarChar(20), phone.trim())
        .input('Note', sql.NVarChar(500), note || null)
        .input('PaymentType', sql.NVarChar(20), normalizedPaymentType)
        .input('PaymentMethod', sql.NVarChar(50), paymentMethod)
        .input('PaymentStatus', sql.NVarChar(50), paymentStatus)
        .input('TrackingNumber', sql.VarChar(50), trackingNumber)
        .query(`
          INSERT INTO dbo.Orders (
            OrderGroupCode, UserID, ShopID, Subtotal, ShippingFee, ShippingMethod,
            ShopDiscount, PlatformDiscount, ShopVoucherCode, PlatformVoucherCode,
            TotalAmount, CommissionRate, CommissionAmount, SellerNetAmount,
            ShippingAddress, Phone, Note, Status, PaymentType, PaymentMethod, PaymentStatus, TrackingNumber
          )
          OUTPUT INSERTED.*
          VALUES (
            @OrderGroupCode, @UserID, @ShopID, @Subtotal, @ShippingFee, @ShippingMethod,
            @ShopDiscount, @PlatformDiscount, @ShopVoucherCode, @PlatformVoucherCode,
            @TotalAmount, @CommissionRate, @CommissionAmount, @SellerNetAmount,
            @ShippingAddress, @Phone, @Note, N'Pending', @PaymentType, @PaymentMethod, @PaymentStatus, @TrackingNumber
          )
        `);

      const createdOrder = orderRes.recordset[0];

      for (const item of group.items) {
        await new sql.Request(transaction)
          .input('OrderID', sql.Int, createdOrder.OrderID)
          .input('BookID', sql.Int, item.bookId)
          .input('UnitPrice', sql.Decimal(18, 2), item.unitPrice)
          .input('Quantity', sql.Int, item.quantity)
          .query(`
            INSERT INTO dbo.OrderDetails (OrderID, BookID, UnitPrice, Quantity)
            VALUES (@OrderID, @BookID, @UnitPrice, @Quantity)
          `);
      }

      // Khởi tạo mốc vận chuyển đầu tiên
      await new sql.Request(transaction)
        .input('OrderID', sql.Int, createdOrder.OrderID)
        .input('Stage', sql.NVarChar(50), 'OrderPlaced')
        .input(
          'Title',
          sql.NVarChar(200),
          isPrepaid
            ? 'Đơn hàng đã đặt — Đang chờ quét mã QR thanh toán trước'
            : 'Đơn hàng đã đặt (Thanh toán khi nhận hàng - COD)'
        )
        .input('Location', sql.NVarChar(250), 'Hệ thống VitaBook')
        .input(
          'Description',
          sql.NVarChar(500),
          isPrepaid
            ? `Mã vận đơn dự kiến: ${trackingNumber}. Vui lòng quét mã QR (${paymentMethod}) để hoàn tất thanh toán.`
            : `Mã vận đơn dự kiến: ${trackingNumber}. Đang chờ Shop "${group.shopName}" xác nhận đơn.`
        )
        .input('UpdatedBy', sql.Int, userId)
        .query(`
          INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy)
          VALUES (@OrderID, @Stage, @Title, @Location, @Description, @UpdatedBy)
        `);

      createdOrders.push({
        ...createdOrder,
        shopName: group.shopName,
        shopOwnerId: group.shopOwnerId,
        items: group.items,
      });
    }

    if (platformVoucher && platformVoucherApplied) {
      await new sql.Request(transaction)
        .input('VoucherID', sql.Int, platformVoucher.VoucherID)
        .query('UPDATE dbo.Vouchers SET UsedCount = UsedCount + 1 WHERE VoucherID = @VoucherID');
    }

    // Nếu là Thanh toán trước -> Tạo phiên mã QR quét bằng điện thoại (hiệu lực 10 phút)
    let qrPayment = null;
    if (isPrepaid) {
      const paymentToken = crypto.randomBytes(12).toString('hex');
      const totalGroupAmount = createdOrders.reduce((sum, o) => sum + Number(o.TotalAmount || 0), 0);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await new sql.Request(transaction)
        .input('PaymentToken', sql.VarChar(64), paymentToken)
        .input('OrderGroupCode', sql.VarChar(50), orderGroupCode)
        .input('UserID', sql.Int, userId)
        .input('TotalAmount', sql.Decimal(18, 2), totalGroupAmount)
        .input('PaymentMethod', sql.NVarChar(50), paymentMethod)
        .input('ExpiresAt', sql.DateTime2, expiresAt)
        .query(`
          INSERT INTO dbo.QrPaymentSessions (PaymentToken, OrderGroupCode, UserID, TotalAmount, PaymentMethod, Status, ExpiresAt)
          VALUES (@PaymentToken, @OrderGroupCode, @UserID, @TotalAmount, @PaymentMethod, N'Pending', @ExpiresAt)
        `);

      const { lanBaseUrl, localBaseUrl, detectedIp } = getQrScanBaseUrls(req);
      qrPayment = {
        paymentToken,
        orderGroupCode,
        totalAmount: totalGroupAmount,
        paymentMethod,
        status: 'Pending',
        expiresAt: expiresAt.toISOString(),
        detectedIp,
        scanUrl: `${lanBaseUrl}/api/orders/qr-pay/${paymentToken}`,
        localScanUrl: `${localBaseUrl}/api/orders/qr-pay/${paymentToken}`,
      };
    }

    await transaction.commit();

    // Thông báo realtime cho từng chủ Shop
    for (const ord of createdOrders) {
      await createNotification(pool, {
        userId: ord.shopOwnerId,
        title: `Đơn hàng mới #${ord.OrderID}!`,
        message: isPrepaid
          ? `Khách ${req.user.fullName} vừa đặt ${ord.items.length} đầu sách (${Number(ord.TotalAmount).toLocaleString('vi-VN')}đ) — Đang chờ khách quét mã QR thanh toán.`
          : `Khách ${req.user.fullName} vừa đặt ${ord.items.length} đầu sách (${Number(ord.TotalAmount).toLocaleString('vi-VN')}đ). Vui lòng xác nhận đơn.`,
        type: 'Order',
        linkUrl: '/seller',
      });
    }

    res.status(201).json({
      success: true,
      message: isPrepaid
        ? 'Đã tạo đơn hàng! Vui lòng dùng điện thoại quét mã QR để hoàn tất thanh toán.'
        : createdOrders.length > 1
          ? `Đặt hàng thành công! Giỏ hàng từ ${createdOrders.length} Gian hàng đã được tách thành ${createdOrders.length} đơn riêng.`
          : 'Đặt hàng thành công!',
      data: {
        orderGroupCode,
        orders: createdOrders,
        qrPayment,
      },
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * Helper gắn OrderDetails + OrderTrackingEvents + Disputes vào danh sách Orders
 */
const hydrateOrders = async (pool, orders) => {
  if (!orders || orders.length === 0) return [];
  const safeIds = orders
    .map((o) => parseInt(o.OrderID, 10))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (safeIds.length === 0) return [];
  const ids = safeIds.join(',');

  const res = await pool.request().query(`
    SELECT od.OrderDetailID, od.OrderID, od.BookID, od.UnitPrice, od.Quantity,
           b.Title, b.ISBN, b.CoverImage, b.BookCondition
    FROM dbo.OrderDetails od
    INNER JOIN dbo.Books b ON od.BookID = b.BookID
    WHERE od.OrderID IN (${ids})
    ORDER BY od.OrderDetailID ASC;

    SELECT te.EventID, te.OrderID, te.Stage, te.Title, te.Location, te.Description, te.CreatedAt,
           u.FullName AS UpdatedByName, u.Role AS UpdatedByRole
    FROM dbo.OrderTrackingEvents te
    LEFT JOIN dbo.Users u ON te.UpdatedBy = u.UserID
    WHERE te.OrderID IN (${ids})
    ORDER BY te.CreatedAt DESC, te.EventID DESC;

    SELECT DisputeID, OrderID, Reason, Status, ResolutionNote, CreatedAt, ResolvedAt
    FROM dbo.Disputes
    WHERE OrderID IN (${ids});

    SELECT ReviewID, OrderID, BookID, Rating
    FROM dbo.Reviews
    WHERE OrderID IN (${ids});
  `);

  const details = res.recordsets[0];
  const tracking = res.recordsets[1];
  const disputes = res.recordsets[2];
  const reviews = res.recordsets[3];

  return orders.map((order) => ({
    ...order,
    items: details.filter((d) => d.OrderID === order.OrderID),
    trackingEvents: tracking.filter((t) => t.OrderID === order.OrderID),
    dispute: disputes.find((d) => d.OrderID === order.OrderID) || null,
    reviewedBookIds: reviews.filter((r) => r.OrderID === order.OrderID).map((r) => r.BookID),
  }));
};

/**
 * GET /api/orders/my-orders (hỗ trợ tùy chọn phân trang ?page=1&limit=10)
 */
const getMyOrders = async (req, res, next) => {
  try {
    const pool = await getPool();
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;

    if (usePagination) {
      const safeLimit = Math.min(limit, 50);
      const offset = (page - 1) * safeLimit;
      const pagedRes = await pool
        .request()
        .input('UserID', sql.Int, req.user.userId)
        .input('Offset', sql.Int, offset)
        .input('Limit', sql.Int, safeLimit)
        .query(`
          SELECT COUNT(*) AS Total FROM dbo.Orders WHERE UserID = @UserID;

          SELECT o.*, s.ShopName, s.LogoUrl AS ShopLogo, s.OwnerID AS ShopOwnerID
          FROM dbo.Orders o
          INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
          WHERE o.UserID = @UserID
          ORDER BY o.CreatedAt DESC, o.OrderID DESC
          OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);

      const total = pagedRes.recordsets[0][0]?.Total || 0;
      const hydrated = await hydrateOrders(pool, pagedRes.recordsets[1]);
      return res.json({
        success: true,
        data: hydrated,
        pagination: { page, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
      });
    }

    const ordersRes = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT o.*, s.ShopName, s.LogoUrl AS ShopLogo, s.OwnerID AS ShopOwnerID
        FROM dbo.Orders o
        INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
        WHERE o.UserID = @UserID
        ORDER BY o.CreatedAt DESC, o.OrderID DESC
      `);

    const hydrated = await hydrateOrders(pool, ordersRes.recordset);
    res.json({ success: true, data: hydrated });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/orders/:id/confirm-received
 * Khách hàng xác nhận "Đã nhận được hàng" -> Hoàn tất đơn + Trừ hoa hồng & Giải ngân vào Ví Shop!
 */
const confirmOrderReceived = async (req, res, next) => {
  let transaction;
  try {
    const orderId = parseInt(req.params.id, 10);
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const orderRes = await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT o.*, s.OwnerID AS ShopOwnerID, s.ShopName
        FROM dbo.Orders o WITH (UPDLOCK)
        INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
        WHERE o.OrderID = @OrderID AND o.UserID = @UserID
      `);

    if (orderRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    const order = orderRes.recordset[0];
    if (order.Status !== 'Delivered') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể xác nhận hoàn tất khi đơn hàng đã được giao thành công (Delivered).',
      });
    }

    await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .query(`
        UPDATE dbo.Orders
        SET Status = N'Completed', PaymentStatus = N'Paid', IsSettled = 1, UpdatedAt = SYSDATETIME()
        WHERE OrderID = @OrderID
      `);

    if (!order.IsSettled) {
      const sellerNet = Number(order.SellerNetAmount);
      const commission = Number(order.CommissionAmount);

      await new sql.Request(transaction)
        .input('ShopID', sql.Int, order.ShopID)
        .input('Amount', sql.Decimal(18, 2), sellerNet)
        .query('UPDATE dbo.Shops SET WalletBalance = WalletBalance + @Amount WHERE ShopID = @ShopID');

      await new sql.Request(transaction)
        .input('ShopID', sql.Int, order.ShopID)
        .input('OrderID', sql.Int, orderId)
        .input('Amount', sql.Decimal(18, 2), sellerNet)
        .input('Note', sql.NVarChar(500), `Giải ngân đơn #${orderId} (đã trừ ${order.CommissionRate}% phí sàn = ${commission.toLocaleString('vi-VN')}đ)`)
        .query(`
          INSERT INTO dbo.WalletTransactions (ShopID, OrderID, Type, Amount, Status, Note)
          VALUES (@ShopID, @OrderID, N'OrderSettlement', @Amount, N'Completed', @Note)
        `);
    }

    await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('UpdatedBy', sql.Int, req.user.userId)
      .query(`
        INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy)
        VALUES (@OrderID, N'Completed', N'Khách hàng đã xác nhận nhận hàng & Hoàn tất đơn', N'Hệ thống VitaBook', N'Tiền doanh thu đã được đối soát hoa hồng và chuyển vào Ví Gian hàng.', @UpdatedBy)
      `);

    await transaction.commit();

    await createNotification(pool, {
      userId: order.ShopOwnerID,
      title: `Đơn #${orderId} đã hoàn tất & cộng tiền Ví!`,
      message: `Shop đã nhận +${Number(order.SellerNetAmount).toLocaleString('vi-VN')}đ vào Ví doanh thu (sau khi trừ ${order.CommissionRate}% hoa hồng sàn).`,
      type: 'Wallet',
      linkUrl: '/seller',
    });

    res.json({ success: true, message: 'Cảm ơn bạn đã xác nhận nhận hàng! Bạn có thể viết đánh giá ngay bây giờ.' });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * PUT /api/orders/:id/cancel
 * Khách hàng hủy đơn khi đơn còn ở trạng thái Pending
 */
const cancelMyOrder = async (req, res, next) => {
  let transaction;
  try {
    const orderId = parseInt(req.params.id, 10);
    const { reason = 'Khách hàng thay đổi nhu cầu mua.' } = req.body;
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const orderRes = await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('UserID', sql.Int, req.user.userId)
      .query('SELECT * FROM dbo.Orders WITH (UPDLOCK) WHERE OrderID = @OrderID AND UserID = @UserID');

    if (orderRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    const order = orderRes.recordset[0];
    if (order.Status !== 'Pending') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể tự hủy đơn khi Shop chưa xác nhận (Pending).',
      });
    }

    const itemsRes = await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .query('SELECT BookID, Quantity FROM dbo.OrderDetails WHERE OrderID = @OrderID');

    for (const item of itemsRes.recordset) {
      await new sql.Request(transaction)
        .input('BookID', sql.Int, item.BookID)
        .input('Quantity', sql.Int, item.Quantity)
        .query('UPDATE dbo.Books SET Stock = Stock + @Quantity, SoldCount = CASE WHEN SoldCount >= @Quantity THEN SoldCount - @Quantity ELSE 0 END WHERE BookID = @BookID');
    }

    const nextPaymentStatus =
      order.PaymentType === 'Prepaid' && ['Escrow', 'Paid'].includes(order.PaymentStatus)
        ? 'Refunded'
        : order.PaymentStatus;
    await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('PaymentStatus', sql.NVarChar(50), nextPaymentStatus)
      .query("UPDATE dbo.Orders SET Status = N'Cancelled', PaymentStatus = @PaymentStatus, UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID");

    if (order.OrderGroupCode && order.PaymentStatus === 'Unpaid') {
      await new sql.Request(transaction)
        .input('OrderGroupCode', sql.VarChar(50), order.OrderGroupCode)
        .query("UPDATE dbo.QrPaymentSessions SET Status = N'Cancelled' WHERE OrderGroupCode = @OrderGroupCode AND Status = N'Pending'");
    }

    await refundOrderVouchers(transaction, order);

    await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('Description', sql.NVarChar(500), `Lý do hủy: ${reason}`)
      .input('UpdatedBy', sql.Int, req.user.userId)
      .query(`
        INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy)
        VALUES (@OrderID, N'Cancelled', N'Đơn hàng đã bị hủy bởi khách hàng', N'Hệ thống VitaBook', @Description, @UpdatedBy)
      `);

    await transaction.commit();
    res.json({ success: true, message: 'Đã hủy đơn hàng và hoàn tồn kho thành công.' });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * GET /api/seller/orders
 */
const getSellerOrders = async (req, res, next) => {
  try {
    const pool = await getPool();
    const shopRes = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .query('SELECT ShopID FROM dbo.Shops WHERE OwnerID = @OwnerID');

    if (shopRes.recordset.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const ordersRes = await pool
      .request()
      .input('ShopID', sql.Int, shopRes.recordset[0].ShopID)
      .query(`
        SELECT o.*, u.FullName AS CustomerName, u.Email AS CustomerEmail, s.ShopName
        FROM dbo.Orders o
        INNER JOIN dbo.Users u ON o.UserID = u.UserID
        INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
        WHERE o.ShopID = @ShopID
        ORDER BY o.CreatedAt DESC
      `);

    const hydrated = await hydrateOrders(pool, ordersRes.recordset);
    res.json({ success: true, data: hydrated });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/seller/orders/:id/status
 * Chủ Shop xác nhận đơn & đóng gói chuẩn bị giao cho Quản lý vận chuyển lấy hàng
 */
const updateSellerOrderStatus = async (req, res, next) => {
  let transaction;
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status, note = '' } = req.body;
    const allowedSellerStatuses = ['Confirmed', 'Packing', 'Cancelled'];

    if (!allowedSellerStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Shop chỉ có thể chuyển trạng thái sang: Confirmed (Xác nhận), Packing (Đang đóng gói) hoặc Cancelled.',
      });
    }

    const pool = await getPool();
    const shopRes = await pool
      .request()
      .input('OwnerID', sql.Int, req.user.userId)
      .query('SELECT ShopID, ShopName, PickupAddress FROM dbo.Shops WHERE OwnerID = @OwnerID');

    if (shopRes.recordset.length === 0) {
      return res.status(403).json({ success: false, message: 'Bạn chưa có Gian hàng.' });
    }
    const shop = shopRes.recordset[0];

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const orderRes = await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('ShopID', sql.Int, shop.ShopID)
      .query('SELECT * FROM dbo.Orders WITH (UPDLOCK) WHERE OrderID = @OrderID AND ShopID = @ShopID');

    if (orderRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng của Shop.' });
    }

    const order = orderRes.recordset[0];
    if (['Shipping', 'Delivered', 'Completed', 'Cancelled', 'Refunded', 'Disputed'].includes(order.Status)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Không thể thay đổi trạng thái đơn đã giao, đang khiếu nại hoặc đã hủy.' });
    }

    if (status === 'Cancelled') {
      const itemsRes = await new sql.Request(transaction)
        .input('OrderID', sql.Int, orderId)
        .query('SELECT BookID, Quantity FROM dbo.OrderDetails WHERE OrderID = @OrderID');
      for (const item of itemsRes.recordset) {
        await new sql.Request(transaction)
          .input('BookID', sql.Int, item.BookID)
          .input('Quantity', sql.Int, item.Quantity)
          .query('UPDATE dbo.Books SET Stock = Stock + @Quantity, SoldCount = CASE WHEN SoldCount >= @Quantity THEN SoldCount - @Quantity ELSE 0 END WHERE BookID = @BookID');
      }
      await refundOrderVouchers(transaction, order);
    }

    const nextPaymentStatus =
      status === 'Cancelled' && order.PaymentType === 'Prepaid' && ['Escrow', 'Paid'].includes(order.PaymentStatus)
        ? 'Refunded'
        : order.PaymentStatus;

    await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('Status', sql.NVarChar(50), status)
      .input('PaymentStatus', sql.NVarChar(50), nextPaymentStatus)
      .query('UPDATE dbo.Orders SET Status = @Status, PaymentStatus = @PaymentStatus, UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID');

    const titleMap = {
      Confirmed: `Shop "${shop.ShopName}" đã xác nhận đơn hàng`,
      Packing: `Shop "${shop.ShopName}" đang đóng gói sách & chờ vận chuyển đến lấy`,
      Cancelled: `Shop "${shop.ShopName}" đã hủy đơn hàng`,
    };

    await new sql.Request(transaction)
      .input('OrderID', sql.Int, orderId)
      .input('Stage', sql.NVarChar(50), status === 'Confirmed' ? 'ShopConfirmed' : status)
      .input('Title', sql.NVarChar(200), titleMap[status])
      .input('Location', sql.NVarChar(250), shop.PickupAddress)
      .input('Description', sql.NVarChar(500), note || 'Cập nhật bởi Người bán.')
      .input('UpdatedBy', sql.Int, req.user.userId)
      .query(`
        INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy)
        VALUES (@OrderID, @Stage, @Title, @Location, @Description, @UpdatedBy)
      `);

    await transaction.commit();

    await createNotification(pool, {
      userId: order.UserID,
      title: `Cập nhật đơn hàng #${orderId}`,
      message: titleMap[status],
      type: 'Tracking',
      linkUrl: '/orders',
    });

    res.json({ success: true, message: `Đã cập nhật trạng thái đơn #${orderId} thành ${status}.` });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderQrMobileHtml = ({ ok, title, subtitle, amount, orderGroupCode, paymentMethod, paidAt }) => `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — VitaBook Xuân</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: linear-gradient(155deg, #7f1d1d 0%, #450a0a 60%, #2a0707 100%);
      color: #fef3c7;
    }
    .card {
      width: 100%;
      max-width: 400px;
      background: #fffbeb;
      color: #3b1510;
      border-radius: 24px;
      border: 3px solid #f59e0b;
      padding: 28px 22px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    }
    .icon {
      width: 72px;
      height: 72px;
      margin: 0 auto 14px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      background: ${ok ? '#d1fae5' : '#fee2e2'};
      color: ${ok ? '#059669' : '#dc2626'};
    }
    h1 { font-size: 22px; font-weight: 800; color: ${ok ? '#065f46' : '#991b1b'}; margin-bottom: 8px; }
    .sub { font-size: 14px; color: #57534e; line-height: 1.5; margin-bottom: 18px; }
    .box {
      background: #fef3c7;
      border: 1.5px dashed #d97706;
      border-radius: 14px;
      padding: 14px;
      text-align: left;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .row { display: flex; justify-content: space-between; gap: 10px; }
    .amount { font-size: 20px; font-weight: 900; color: #b91c1c; }
    .footer { font-size: 12px; color: #78716c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '✓' : '!'}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="sub">${escapeHtml(subtitle)}</p>
    ${
      orderGroupCode
        ? `<div class="box">
            <div class="row"><span>Mã giao dịch:</span><strong>${escapeHtml(orderGroupCode)}</strong></div>
            <div class="row"><span>Kênh thanh toán:</span><strong>${escapeHtml(paymentMethod || 'VIETQR')}</strong></div>
            <div class="row"><span>Số tiền:</span><span class="amount">${escapeHtml(Number(amount || 0).toLocaleString('vi-VN'))}đ</span></div>
            ${paidAt ? `<div class="row"><span>Thời gian:</span><strong>${escapeHtml(new Date(paidAt).toLocaleString('vi-VN'))}</strong></div>` : ''}
          </div>`
        : ''
    }
    <p class="footer">🏮 VitaBook Xuân Đinh Mùi 2027 • Bạn có thể đóng trang này và xem kết quả trên màn hình máy tính.</p>
  </div>
</body>
</html>`;

/**
 * Helper: Tự động xử lý hết hạn phiên QR (quá 10 phút chưa quét -> Thanh toán thất bại + Hủy đơn + Hoàn kho & Voucher)
 */
const expireQrPaymentSession = async (pool, paymentToken) => {
  let transaction;
  try {
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const sessRes = await new sql.Request(transaction)
      .input('PaymentToken', sql.VarChar(64), paymentToken)
      .query('SELECT * FROM dbo.QrPaymentSessions WITH (UPDLOCK) WHERE PaymentToken = @PaymentToken');

    if (sessRes.recordset.length === 0) {
      await transaction.rollback();
      return null;
    }

    const session = sessRes.recordset[0];
    if (session.Status !== 'Pending') {
      await transaction.commit();
      return session;
    }

    await new sql.Request(transaction)
      .input('SessionID', sql.Int, session.SessionID)
      .query("UPDATE dbo.QrPaymentSessions SET Status = N'Expired' WHERE SessionID = @SessionID");

    // Hủy các đơn Thanh toán trước vẫn đang Unpaid & hoàn tồn kho + voucher
    const unpaidOrdersRes = await new sql.Request(transaction)
      .input('OrderGroupCode', sql.VarChar(50), session.OrderGroupCode)
      .input('UserID', sql.Int, session.UserID)
      .query(`
        SELECT * FROM dbo.Orders WITH (UPDLOCK)
        WHERE OrderGroupCode = @OrderGroupCode AND UserID = @UserID
          AND PaymentType = N'Prepaid' AND PaymentStatus = N'Unpaid' AND Status = N'Pending'
      `);

    for (const ord of unpaidOrdersRes.recordset) {
      const itemsRes = await new sql.Request(transaction)
        .input('OrderID', sql.Int, ord.OrderID)
        .query('SELECT BookID, Quantity FROM dbo.OrderDetails WHERE OrderID = @OrderID');

      for (const item of itemsRes.recordset) {
        await new sql.Request(transaction)
          .input('BookID', sql.Int, item.BookID)
          .input('Quantity', sql.Int, item.Quantity)
          .query('UPDATE dbo.Books SET Stock = Stock + @Quantity, SoldCount = CASE WHEN SoldCount >= @Quantity THEN SoldCount - @Quantity ELSE 0 END WHERE BookID = @BookID');
      }

      await refundOrderVouchers(transaction, ord);

      await new sql.Request(transaction)
        .input('OrderID', sql.Int, ord.OrderID)
        .query("UPDATE dbo.Orders SET Status = N'Cancelled', UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID");

      await new sql.Request(transaction)
        .input('OrderID', sql.Int, ord.OrderID)
        .input('UpdatedBy', sql.Int, session.UserID)
        .query(`
          INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy)
          VALUES (
            @OrderID,
            N'PaymentFailed',
            N'Thanh toán QR thất bại (Quá thời gian 10 phút)',
            N'Cổng thanh toán VitaBook QR',
            N'Không nhận được xác nhận quét mã QR trong 10 phút. Đơn hàng đã tự động hủy và hoàn tồn kho.',
            @UpdatedBy
          )
        `);
    }

    await transaction.commit();

    pushToUser(session.UserID, 'qr_payment_failed', {
      paymentToken: session.PaymentToken,
      orderGroupCode: session.OrderGroupCode,
      totalAmount: Number(session.TotalAmount),
      paymentMethod: session.PaymentMethod,
      status: 'Expired',
      message: 'Thanh toán thất bại do hết thời gian 10 phút. Đơn hàng đã tự động hủy.',
    });

    await createNotification(pool, {
      userId: session.UserID,
      title: 'Thanh toán QR thất bại (Hết hạn 10 phút)',
      message: `Đơn ${session.OrderGroupCode} đã quá 10 phút chưa quét mã QR thanh toán nên đã tự động hủy.`,
      type: 'Order',
      linkUrl: '/orders',
    });

    return { ...session, Status: 'Expired' };
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    throw error;
  }
};

/**
 * Quét nền định kỳ các phiên QR quá 10 phút chưa thanh toán để tự động hủy đơn & hoàn kho
 */
const sweepExpiredQrSessions = async (pool) => {
  try {
    const expiredRes = await pool.request().query(`
      SELECT PaymentToken
      FROM dbo.QrPaymentSessions
      WHERE Status = N'Pending' AND ExpiresAt <= SYSDATETIME()
    `);
    for (const row of expiredRes.recordset) {
      await expireQrPaymentSession(pool, row.PaymentToken);
    }
  } catch (err) {
    console.warn('[QR Sweeper] Không thể kiểm tra phiên QR hết hạn:', err.message);
  }
};

/**
 * Helper dùng chung: Xác nhận phiên thanh toán QR -> Cập nhật Orders sang Escrow -> Bắn SSE về trình duyệt PC
 */
const settleQrPaymentSession = async (pool, paymentToken) => {
  let transaction;
  try {
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const sessRes = await new sql.Request(transaction)
      .input('PaymentToken', sql.VarChar(64), paymentToken)
      .query('SELECT * FROM dbo.QrPaymentSessions WITH (UPDLOCK) WHERE PaymentToken = @PaymentToken');

    if (sessRes.recordset.length === 0) {
      await transaction.rollback();
      return { ok: false, code: 'NOT_FOUND', message: 'Mã QR thanh toán không tồn tại hoặc không hợp lệ.' };
    }

    const session = sessRes.recordset[0];

    if (session.Status === 'Paid') {
      await transaction.commit();
      return { ok: true, alreadyPaid: true, session };
    }

    if (session.Status === 'Cancelled') {
      await transaction.rollback();
      return { ok: false, code: 'CANCELLED', message: 'Đơn hàng gắn với mã QR này đã bị hủy.', session };
    }

    if (new Date(session.ExpiresAt) <= new Date()) {
      await transaction.rollback();
      const expiredSession = await expireQrPaymentSession(pool, paymentToken);
      return {
        ok: false,
        code: 'EXPIRED',
        message: 'Thanh toán thất bại! Mã QR đã quá thời gian 10 phút và đơn hàng đã tự động hủy.',
        session: expiredSession || session,
      };
    }

    const paidAtRes = await new sql.Request(transaction)
      .input('SessionID', sql.Int, session.SessionID)
      .query(`
        UPDATE dbo.QrPaymentSessions
        SET Status = N'Paid', PaidAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE SessionID = @SessionID
      `);
    const updatedSession = paidAtRes.recordset[0];

    const ordersRes = await new sql.Request(transaction)
      .input('OrderGroupCode', sql.VarChar(50), session.OrderGroupCode)
      .input('UserID', sql.Int, session.UserID)
      .query(`
        SELECT o.OrderID, o.ShopID, o.TotalAmount, o.PaymentStatus, o.Status, s.OwnerID AS ShopOwnerID, s.ShopName
        FROM dbo.Orders o WITH (UPDLOCK)
        INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
        WHERE o.OrderGroupCode = @OrderGroupCode AND o.UserID = @UserID AND o.Status NOT IN (N'Cancelled', N'Refunded')
      `);

    for (const ord of ordersRes.recordset) {
      await new sql.Request(transaction)
        .input('OrderID', sql.Int, ord.OrderID)
        .query("UPDATE dbo.Orders SET PaymentStatus = N'Escrow', UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID");

      await new sql.Request(transaction)
        .input('OrderID', sql.Int, ord.OrderID)
        .input('Method', sql.NVarChar(50), session.PaymentMethod)
        .input('UpdatedBy', sql.Int, session.UserID)
        .query(`
          INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy)
          VALUES (
            @OrderID,
            N'PaymentConfirmed',
            N'Đã quét mã QR & xác nhận thanh toán thành công (Sàn giữ tiền hộ)',
            N'Cổng thanh toán VitaBook QR',
            N'Khách hàng đã quét mã QR qua kênh ' + @Method + N'. Tiền được sàn giữ hộ an toàn (Escrow) chờ giao sách.',
            @UpdatedBy
          )
        `);
    }

    await transaction.commit();

    // Đẩy sự kiện realtime qua SSE để trình duyệt máy tính chuyển ngay sang "Thanh toán thành công"
    pushToUser(session.UserID, 'qr_payment_confirmed', {
      paymentToken: updatedSession.PaymentToken,
      orderGroupCode: updatedSession.OrderGroupCode,
      totalAmount: Number(updatedSession.TotalAmount),
      paymentMethod: updatedSession.PaymentMethod,
      paidAt: updatedSession.PaidAt,
      status: 'Paid',
    });

    await createNotification(pool, {
      userId: session.UserID,
      title: 'Thanh toán QR thành công!',
      message: `Đơn ${updatedSession.OrderGroupCode} (${Number(updatedSession.TotalAmount).toLocaleString('vi-VN')}đ) đã được xác nhận thanh toán qua ${updatedSession.PaymentMethod}.`,
      type: 'Order',
      linkUrl: '/orders',
    });

    for (const ord of ordersRes.recordset) {
      await createNotification(pool, {
        userId: ord.ShopOwnerID,
        title: `Đơn #${ord.OrderID} đã thanh toán QR!`,
        message: `Khách đã quét mã QR thanh toán ${Number(ord.TotalAmount).toLocaleString('vi-VN')}đ (Sàn đang giữ hộ). Shop có thể xác nhận & đóng gói ngay!`,
        type: 'Order',
        linkUrl: '/seller',
      });
    }

    return { ok: true, alreadyPaid: false, session: updatedSession };
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    throw error;
  }
};

/**
 * GET /api/orders/qr-pay/:token (PUBLIC - Mở trực tiếp khi điện thoại quét mã QR)
 */
const confirmQrScanPayment = async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    const pool = await getPool();
    const result = await settleQrPaymentSession(pool, token);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!result.ok) {
      return res.status(result.code === 'NOT_FOUND' ? 404 : 400).send(
        renderQrMobileHtml({
          ok: false,
          title: 'Không thể xác nhận thanh toán',
          subtitle: result.message,
          amount: result.session?.TotalAmount,
          orderGroupCode: result.session?.OrderGroupCode,
          paymentMethod: result.session?.PaymentMethod,
        })
      );
    }

    const s = result.session;
    return res.status(200).send(
      renderQrMobileHtml({
        ok: true,
        title: result.alreadyPaid ? 'Đơn hàng đã thanh toán!' : 'Thanh toán thành công!',
        subtitle: result.alreadyPaid
          ? 'Giao dịch QR này đã được hệ thống ghi nhận trước đó.'
          : 'Hệ thống đã xác nhận bạn vừa quét mã QR thành công! Màn hình máy tính của bạn đã tự động cập nhật trạng thái đơn hàng.',
        amount: s.TotalAmount,
        orderGroupCode: s.OrderGroupCode,
        paymentMethod: s.PaymentMethod,
        paidAt: s.PaidAt,
      })
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/qr-status/:token (Authenticated - Trình duyệt PC kiểm tra trạng thái quét QR)
 */
const getQrPaymentStatus = async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('PaymentToken', sql.VarChar(64), token)
      .input('UserID', sql.Int, req.user.userId)
      .query('SELECT * FROM dbo.QrPaymentSessions WHERE PaymentToken = @PaymentToken AND UserID = @UserID');

    if (resData.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiên thanh toán QR.' });
    }

    let s = resData.recordset[0];
    if (s.Status === 'Pending' && new Date(s.ExpiresAt) <= new Date()) {
      s = (await expireQrPaymentSession(pool, token)) || { ...s, Status: 'Expired' };
    }
    res.json({
      success: true,
      data: {
        paymentToken: s.PaymentToken,
        orderGroupCode: s.OrderGroupCode,
        totalAmount: Number(s.TotalAmount),
        paymentMethod: s.PaymentMethod,
        status: s.Status,
        paidAt: s.PaidAt,
        expiresAt: s.ExpiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/qr-simulate/:token (Authenticated - Nút mô phỏng quét thành công dự phòng trên máy tính)
 */
const simulateQrPayment = async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    const pool = await getPool();

    const ownerCheck = await pool
      .request()
      .input('PaymentToken', sql.VarChar(64), token)
      .input('UserID', sql.Int, req.user.userId)
      .query('SELECT SessionID FROM dbo.QrPaymentSessions WHERE PaymentToken = @PaymentToken AND UserID = @UserID');

    if (ownerCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiên thanh toán QR của bạn.' });
    }

    const result = await settleQrPaymentSession(pool, token);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({
      success: true,
      message: 'Xác nhận thanh toán QR thành công!',
      data: {
        paymentToken: result.session.PaymentToken,
        orderGroupCode: result.session.OrderGroupCode,
        totalAmount: Number(result.session.TotalAmount),
        paymentMethod: result.session.PaymentMethod,
        status: 'Paid',
        paidAt: result.session.PaidAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/:id/qr-session (Authenticated - Tạo lại mã QR cho đơn Thanh toán trước đang Unpaid trong Đơn hàng của tôi)
 */
const createQrSessionForOrder = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const ordRes = await pool
      .request()
      .input('OrderID', sql.Int, orderId)
      .input('UserID', sql.Int, req.user.userId)
      .query('SELECT * FROM dbo.Orders WHERE OrderID = @OrderID AND UserID = @UserID');

    if (ordRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    const order = ordRes.recordset[0];
    if (order.PaymentType !== 'Prepaid' || order.PaymentStatus !== 'Unpaid' || ['Cancelled', 'Refunded'].includes(order.Status)) {
      return res.status(400).json({ success: false, message: 'Đơn hàng này không ở trạng thái chờ thanh toán QR.' });
    }

    const groupCode = order.OrderGroupCode || `ORD-${order.OrderID}`;
    if (!order.OrderGroupCode) {
      await pool
        .request()
        .input('OrderID', sql.Int, order.OrderID)
        .input('OrderGroupCode', sql.VarChar(50), groupCode)
        .query('UPDATE dbo.Orders SET OrderGroupCode = @OrderGroupCode WHERE OrderID = @OrderID');
    }

    // Tổng tiền của tất cả đơn cùng nhóm còn Unpaid
    const sumRes = await pool
      .request()
      .input('OrderGroupCode', sql.VarChar(50), groupCode)
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT ISNULL(SUM(TotalAmount), 0) AS GroupTotal
        FROM dbo.Orders
        WHERE OrderGroupCode = @OrderGroupCode AND UserID = @UserID
          AND PaymentStatus = N'Unpaid' AND Status NOT IN (N'Cancelled', N'Refunded')
      `);
    const totalAmount = Number(sumRes.recordset[0]?.GroupTotal || order.TotalAmount);

    // Hủy các phiên QR cũ chưa dùng của nhóm đơn này rồi cấp phiên mới 10 phút
    await pool
      .request()
      .input('OrderGroupCode', sql.VarChar(50), groupCode)
      .query("UPDATE dbo.QrPaymentSessions SET Status = N'Cancelled' WHERE OrderGroupCode = @OrderGroupCode AND Status = N'Pending'");

    const paymentToken = crypto.randomBytes(12).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool
      .request()
      .input('PaymentToken', sql.VarChar(64), paymentToken)
      .input('OrderGroupCode', sql.VarChar(50), groupCode)
      .input('UserID', sql.Int, req.user.userId)
      .input('TotalAmount', sql.Decimal(18, 2), totalAmount)
      .input('PaymentMethod', sql.NVarChar(50), order.PaymentMethod || 'VIETQR')
      .input('ExpiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO dbo.QrPaymentSessions (PaymentToken, OrderGroupCode, UserID, TotalAmount, PaymentMethod, Status, ExpiresAt)
        VALUES (@PaymentToken, @OrderGroupCode, @UserID, @TotalAmount, @PaymentMethod, N'Pending', @ExpiresAt)
      `);

    const { lanBaseUrl, localBaseUrl, detectedIp } = getQrScanBaseUrls(req);
    res.status(201).json({
      success: true,
      data: {
        paymentToken,
        orderGroupCode: groupCode,
        totalAmount,
        paymentMethod: order.PaymentMethod || 'VIETQR',
        status: 'Pending',
        expiresAt: expiresAt.toISOString(),
        detectedIp,
        scanUrl: `${lanBaseUrl}/api/orders/qr-pay/${paymentToken}`,
        localScanUrl: `${localBaseUrl}/api/orders/qr-pay/${paymentToken}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calcVoucherDiscount,
  mergeOrderItems,
  createOrder,
  hydrateOrders,
  getMyOrders,
  confirmOrderReceived,
  cancelMyOrder,
  getSellerOrders,
  updateSellerOrderStatus,
  confirmQrScanPayment,
  getQrPaymentStatus,
  simulateQrPayment,
  createQrSessionForOrder,
  sweepExpiredQrSessions,
};
