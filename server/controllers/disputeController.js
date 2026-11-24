const { sql, getPool } = require('../config/db');
const { safeJsonParse, notifyManagers, createNotification } = require('../utils/helpers');

/**
 * POST /api/disputes
 * Khách hàng gửi yêu cầu Khiếu nại / Trả hàng hoàn tiền -> Manager phân xử
 */
const createDispute = async (req, res, next) => {
  let transaction;
  try {
    const { orderId, reason, description, evidenceImages = [], requestedAction = 'ReturnAndRefund' } = req.body;

    if (!orderId || !reason || !description) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn Lý do và mô tả chi tiết sự cố với đơn hàng.',
      });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const ordRes = await new sql.Request(transaction)
      .input('OrderID', sql.Int, parseInt(orderId, 10))
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT o.*, s.OwnerID AS ShopOwnerID, s.ShopName
        FROM dbo.Orders o WITH (UPDLOCK)
        INNER JOIN dbo.Shops s ON o.ShopID = s.ShopID
        WHERE o.OrderID = @OrderID AND o.UserID = @UserID
      `);

    if (ordRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });
    }

    const order = ordRes.recordset[0];
    if (!['Shipping', 'Delivered'].includes(order.Status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể gửi khiếu nại khi đơn hàng đang giao hoặc vừa giao xong (chưa bấm hoàn tất).',
      });
    }

    const existing = await new sql.Request(transaction)
      .input('OrderID', sql.Int, order.OrderID)
      .query("SELECT DisputeID FROM dbo.Disputes WHERE OrderID = @OrderID AND Status IN (N'Open', N'Reviewing')");

    if (existing.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: 'Đơn hàng này đang có khiếu nại chờ xử lý.' });
    }

    const inserted = await new sql.Request(transaction)
      .input('OrderID', sql.Int, order.OrderID)
      .input('BuyerID', sql.Int, req.user.userId)
      .input('ShopID', sql.Int, order.ShopID)
      .input('Reason', sql.NVarChar(200), reason.trim())
      .input('Description', sql.NVarChar(sql.MAX), description.trim())
      .input('EvidenceImages', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(evidenceImages) ? evidenceImages : []))
      .input('RequestedAction', sql.NVarChar(50), requestedAction)
      .query(`
        INSERT INTO dbo.Disputes (OrderID, BuyerID, ShopID, Reason, Description, EvidenceImages, RequestedAction, Status)
        OUTPUT INSERTED.*
        VALUES (@OrderID, @BuyerID, @ShopID, @Reason, @Description, @EvidenceImages, @RequestedAction, N'Open')
      `);

    await new sql.Request(transaction)
      .input('OrderID', sql.Int, order.OrderID)
      .query("UPDATE dbo.Orders SET Status = N'Disputed', UpdatedAt = SYSDATETIME() WHERE OrderID = @OrderID");

    await transaction.commit();

    await notifyManagers(pool, {
      title: `Khiếu nại mới cho đơn #${order.OrderID}`,
      message: `Khách ${req.user.fullName} khiếu nại Shop "${order.ShopName}": ${reason.trim()}`,
      type: 'Dispute',
      linkUrl: '/manager',
    });

    await createNotification(pool, {
      userId: order.ShopOwnerID,
      title: `Đơn #${order.OrderID} đang bị khiếu nại`,
      message: `Khách hàng yêu cầu trả hàng/hoàn tiền với lý do: ${reason.trim()}. Quản lý sàn đang xem xét.`,
      type: 'Dispute',
      linkUrl: '/seller',
    });

    res.status(201).json({
      success: true,
      message: 'Đã gửi yêu cầu khiếu nại thành công! Quản lý sàn sẽ kiểm tra và phân xử sớm nhất.',
      data: inserted.recordset[0],
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * GET /api/disputes/my
 */
const getMyDisputes = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('BuyerID', sql.Int, req.user.userId)
      .query(`
        SELECT d.*, s.ShopName, o.TotalAmount
        FROM dbo.Disputes d
        INNER JOIN dbo.Shops s ON d.ShopID = s.ShopID
        INNER JOIN dbo.Orders o ON d.OrderID = o.OrderID
        WHERE d.BuyerID = @BuyerID
        ORDER BY d.CreatedAt DESC
      `);

    res.json({
      success: true,
      data: resData.recordset.map((d) => ({ ...d, evidenceImages: safeJsonParse(d.EvidenceImages, []) })),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDispute,
  getMyDisputes,
};
