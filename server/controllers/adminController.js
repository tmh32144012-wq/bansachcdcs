const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../config/db');
const { createNotification, createAuditLog } = require('../utils/helpers');

/**
 * GET /api/admin/stats
 * Báo cáo tài chính tổng toàn sàn cho Admin
 */
const getAdminDashboardStats = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Users) AS TotalUsers,
        (SELECT COUNT(*) FROM dbo.Users WHERE Role = N'Manager') AS TotalManagers,
        (SELECT COUNT(*) FROM dbo.Shops WHERE ApprovalStatus = N'Approved') AS ApprovedShops,
        (SELECT COUNT(*) FROM dbo.Books WHERE ApprovalStatus = N'Approved') AS ApprovedBooks,
        (SELECT COUNT(*) FROM dbo.Orders) AS TotalOrders,
        (SELECT ISNULL(SUM(TotalAmount), 0) FROM dbo.Orders WHERE Status NOT IN (N'Cancelled', N'Refunded')) AS TotalGMV,
        (SELECT ISNULL(SUM(CommissionAmount), 0) FROM dbo.Orders WHERE IsSettled = 1) AS TotalCommissionEarned,
        (SELECT COUNT(*) FROM dbo.WalletTransactions WHERE Type = N'Withdrawal' AND Status = N'Pending') AS PendingWithdrawals;

      SELECT TOP 10
        s.ShopID, s.ShopName, s.ShopType, s.WalletBalance,
        (SELECT COUNT(*) FROM dbo.Orders o WHERE o.ShopID = s.ShopID AND o.Status NOT IN (N'Cancelled', N'Refunded')) AS OrderCount,
        (SELECT ISNULL(SUM(o.TotalAmount), 0) FROM dbo.Orders o WHERE o.ShopID = s.ShopID AND o.Status NOT IN (N'Cancelled', N'Refunded')) AS ShopRevenue,
        (SELECT ISNULL(SUM(o.CommissionAmount), 0) FROM dbo.Orders o WHERE o.ShopID = s.ShopID AND o.IsSettled = 1) AS CommissionPaid
      FROM dbo.Shops s
      WHERE s.ApprovalStatus = N'Approved'
      ORDER BY ShopRevenue DESC;
    `);

    res.json({
      success: true,
      data: {
        summary: resData.recordsets[0][0],
        topShops: resData.recordsets[1],
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/users (hỗ trợ tùy chọn phân trang ?page=1&limit=20)
 */
const getUsers = async (req, res, next) => {
  try {
    const pool = await getPool();
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;

    if (usePagination) {
      const safeLimit = Math.min(limit, 100);
      const offset = (page - 1) * safeLimit;
      const pagedRes = await pool
        .request()
        .input('Offset', sql.Int, offset)
        .input('Limit', sql.Int, safeLimit)
        .query(`
          SELECT COUNT(*) AS Total FROM dbo.Users;

          SELECT u.UserID, u.FullName, u.Email, u.Role, u.Phone, u.Address, u.IsActive, u.CreatedAt,
                 s.ShopID, s.ShopName, s.ApprovalStatus AS ShopStatus
          FROM dbo.Users u
          LEFT JOIN dbo.Shops s ON u.UserID = s.OwnerID
          ORDER BY u.CreatedAt DESC
          OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
        `);
      const total = pagedRes.recordsets[0][0]?.Total || 0;
      return res.json({
        success: true,
        data: pagedRes.recordsets[1],
        pagination: { page, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
      });
    }

    const resData = await pool.request().query(`
      SELECT u.UserID, u.FullName, u.Email, u.Role, u.Phone, u.Address, u.IsActive, u.CreatedAt,
             s.ShopID, s.ShopName, s.ApprovalStatus AS ShopStatus
      FROM dbo.Users u
      LEFT JOIN dbo.Shops s ON u.UserID = s.OwnerID
      ORDER BY u.CreatedAt DESC
    `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/users/manager
 * Admin tạo tài khoản Quản lý (Manager) mới
 */
const createManagerAccount = async (req, res, next) => {
  try {
    const { fullName, email, password, phone } = req.body;
    if (!fullName || !email || !password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Họ tên, Email và Mật khẩu (>= 6 ký tự).',
      });
    }

    const pool = await getPool();
    const normalizedEmail = email.trim().toLowerCase();

    const exists = await pool
      .request()
      .input('Email', sql.VarChar(150), normalizedEmail)
      .query('SELECT UserID FROM dbo.Users WHERE Email = @Email');

    if (exists.recordset.length > 0) {
      return res.status(409).json({ success: false, message: 'Email đã tồn tại trên hệ thống.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const inserted = await pool
      .request()
      .input('FullName', sql.NVarChar(150), fullName.trim())
      .input('Email', sql.VarChar(150), normalizedEmail)
      .input('PasswordHash', sql.VarChar(255), passwordHash)
      .input('Phone', sql.VarChar(20), phone || null)
      .query(`
        INSERT INTO dbo.Users (FullName, Email, PasswordHash, Role, Phone)
        OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.Email, INSERTED.Role, INSERTED.Phone, INSERTED.IsActive, INSERTED.CreatedAt
        VALUES (@FullName, @Email, @PasswordHash, N'Manager', @Phone)
      `);

    await createAuditLog(pool, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'CreateManagerAccount',
      targetType: 'User',
      targetId: inserted.recordset[0].UserID,
      details: `Tạo tài khoản Quản lý: ${normalizedEmail}`,
    });

    res.status(201).json({
      success: true,
      message: 'Tạo tài khoản Quản lý (Manager) thành công!',
      data: inserted.recordset[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/users/:id
 * Admin thay đổi Role hoặc Khóa/Mở tài khoản
 */
const updateUserRoleOrStatus = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { role, isActive } = req.body;

    if (userId === req.user.userId) {
      return res.status(400).json({ success: false, message: 'Không thể tự thay đổi quyền hoặc khóa chính tài khoản của bạn.' });
    }

    const pool = await getPool();
    const currentRes = await pool
      .request()
      .input('UserID', sql.Int, userId)
      .query('SELECT UserID, Role, IsActive, Email FROM dbo.Users WHERE UserID = @UserID');

    if (currentRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const old = currentRes.recordset[0];
    const nextRole = ['Customer', 'Manager', 'Admin'].includes(role) ? role : old.Role;
    const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : old.IsActive;
    const shouldRevokeSessions = nextRole !== old.Role || !nextActive;

    await pool
      .request()
      .input('UserID', sql.Int, userId)
      .input('Role', sql.NVarChar(20), nextRole)
      .input('IsActive', sql.Bit, nextActive)
      .query(
        shouldRevokeSessions
          ? 'UPDATE dbo.Users SET Role = @Role, IsActive = @IsActive, TokenVersion = ISNULL(TokenVersion, 0) + 1 WHERE UserID = @UserID'
          : 'UPDATE dbo.Users SET Role = @Role, IsActive = @IsActive WHERE UserID = @UserID'
      );

    await createAuditLog(pool, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'UpdateUserAccount',
      targetType: 'User',
      targetId: userId,
      details: `${old.Email} -> Role: ${nextRole}, Active: ${Boolean(nextActive)}`,
    });

    res.json({ success: true, message: 'Đã cập nhật thông tin tài khoản thành công.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/settings & PUT /api/admin/settings
 */
const getSystemSettings = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query('SELECT * FROM dbo.SystemSettings ORDER BY SettingKey ASC');
    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

const updateSystemSettings = async (req, res, next) => {
  try {
    const { settings } = req.body; // { CommissionRate: '5', ShippingFeeStandard: '30000', ... }
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Dữ liệu cấu hình không hợp lệ.' });
    }

    const pool = await getPool();
    for (const [key, val] of Object.entries(settings)) {
      await pool
        .request()
        .input('Key', sql.VarChar(100), key)
        .input('Val', sql.NVarChar(500), String(val))
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = @Key)
            UPDATE dbo.SystemSettings SET SettingValue = @Val, UpdatedAt = SYSDATETIME() WHERE SettingKey = @Key
          ELSE
            INSERT INTO dbo.SystemSettings (SettingKey, SettingValue) VALUES (@Key, @Val)
        `);
    }

    await createAuditLog(pool, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'UpdateSystemSettings',
      targetType: 'SystemSettings',
      details: JSON.stringify(settings),
    });

    res.json({ success: true, message: 'Đã lưu cấu hình sàn thành công!' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/withdrawals & PUT /api/admin/withdrawals/:id
 * Duyệt hoặc từ chối yêu cầu rút tiền từ Ví Shop
 */
const getWithdrawals = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query(`
      SELECT wt.*, s.ShopName, u.FullName AS OwnerName, u.Email AS OwnerEmail, p.FullName AS ProcessedByName
      FROM dbo.WalletTransactions wt
      INNER JOIN dbo.Shops s ON wt.ShopID = s.ShopID
      INNER JOIN dbo.Users u ON s.OwnerID = u.UserID
      LEFT JOIN dbo.Users p ON wt.ProcessedBy = p.UserID
      WHERE wt.Type = N'Withdrawal'
      ORDER BY CASE WHEN wt.Status = N'Pending' THEN 0 ELSE 1 END, wt.CreatedAt DESC
    `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

const processWithdrawal = async (req, res, next) => {
  let transaction;
  try {
    const txId = parseInt(req.params.id, 10);
    const { status, note = '' } = req.body; // 'Completed' | 'Rejected'

    if (!['Completed', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái duyệt rút tiền không hợp lệ.' });
    }

    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const txRes = await new sql.Request(transaction)
      .input('TxID', sql.Int, txId)
      .query(`
        SELECT wt.*, s.OwnerID, s.ShopName
        FROM dbo.WalletTransactions wt WITH (UPDLOCK)
        INNER JOIN dbo.Shops s ON wt.ShopID = s.ShopID
        WHERE wt.TransactionID = @TxID AND wt.Type = N'Withdrawal'
      `);

    if (txRes.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu rút tiền.' });
    }

    const tx = txRes.recordset[0];
    if (tx.Status !== 'Pending') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Yêu cầu rút tiền này đã được xử lý.' });
    }

    // Nếu từ chối rút -> hoàn tiền lại vào Ví Shop
    if (status === 'Rejected') {
      await new sql.Request(transaction)
        .input('ShopID', sql.Int, tx.ShopID)
        .input('Amount', sql.Decimal(18, 2), Number(tx.Amount))
        .query('UPDATE dbo.Shops SET WalletBalance = WalletBalance + @Amount WHERE ShopID = @ShopID');
    }

    await new sql.Request(transaction)
      .input('TxID', sql.Int, txId)
      .input('Status', sql.NVarChar(20), status)
      .input('ProcessedBy', sql.Int, req.user.userId)
      .input('Note', sql.NVarChar(500), note ? `${tx.Note || ''} | Admin: ${note}` : tx.Note)
      .query('UPDATE dbo.WalletTransactions SET Status = @Status, ProcessedBy = @ProcessedBy, Note = @Note WHERE TransactionID = @TxID');

    await createAuditLog(transaction, {
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: `Withdrawal_${status}`,
      targetType: 'WalletTransaction',
      targetId: txId,
      details: `Shop "${tx.ShopName}" rút ${Number(tx.Amount).toLocaleString('vi-VN')}đ -> ${status}`,
    });

    await transaction.commit();

    await createNotification(pool, {
      userId: tx.OwnerID,
      title: status === 'Completed' ? 'Rút tiền Ví Shop thành công!' : 'Yêu cầu rút tiền bị từ chối',
      message: status === 'Completed'
        ? `Số tiền ${Number(tx.Amount).toLocaleString('vi-VN')}đ đã được chuyển về tài khoản ngân hàng của bạn.`
        : `Số tiền ${Number(tx.Amount).toLocaleString('vi-VN')}đ đã được hoàn lại Ví Shop. ${note}`,
      type: 'Wallet',
      linkUrl: '/seller',
    });

    res.json({ success: true, message: status === 'Completed' ? 'Đã duyệt chuyển khoản rút tiền.' : 'Đã từ chối và hoàn số dư vào Ví Shop.' });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    next(error);
  }
};

/**
 * GET /api/admin/audit-logs
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool.request().query(`
      SELECT TOP 100 al.*, u.FullName AS ActorName, u.Email AS ActorEmail
      FROM dbo.AuditLogs al
      INNER JOIN dbo.Users u ON al.ActorID = u.UserID
      ORDER BY al.CreatedAt DESC
    `);
    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/publishers & DELETE /api/admin/publishers/:id
 */
const createPublisher = async (req, res, next) => {
  try {
    const { publisherName } = req.body;
    if (!publisherName || !publisherName.trim()) {
      return res.status(400).json({ success: false, message: 'Tên NXB không được để trống.' });
    }
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('PublisherName', sql.NVarChar(150), publisherName.trim())
      .query('INSERT INTO dbo.Publishers (PublisherName) OUTPUT INSERTED.* VALUES (@PublisherName)');
    res.status(201).json({ success: true, message: 'Thêm NXB thành công.', data: resData.recordset[0] });
  } catch (error) {
    next(error);
  }
};

const deletePublisher = async (req, res, next) => {
  try {
    const publisherId = parseInt(req.params.id, 10);
    const pool = await getPool();
    await pool.request().input('ID', sql.Int, publisherId).query('DELETE FROM dbo.Publishers WHERE PublisherID = @ID');
    res.json({ success: true, message: 'Đã xóa NXB.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminDashboardStats,
  getUsers,
  createManagerAccount,
  updateUserRoleOrStatus,
  getSystemSettings,
  updateSystemSettings,
  getWithdrawals,
  processWithdrawal,
  getAuditLogs,
  createPublisher,
  deletePublisher,
};
