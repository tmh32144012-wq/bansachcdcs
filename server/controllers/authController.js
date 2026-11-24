const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');
const {
  getJwtSecret,
  createCaptchaChallenge,
  verifyCaptchaChallenge,
} = require('../utils/security');

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.UserID,
      email: user.Email,
      role: user.Role,
      fullName: user.FullName,
      tokenVersion: Number(user.TokenVersion || 0),
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const fetchUserWithShop = async (pool, userId) => {
  const res = await pool
    .request()
    .input('UserID', sql.Int, userId)
    .query(`
      SELECT
        u.UserID, u.FullName, u.Email, u.Role, u.Address, u.Phone, u.AvatarUrl, u.IsActive, u.CreatedAt,
        s.ShopID, s.ShopName, s.ApprovalStatus AS ShopStatus, s.ShopType, s.WalletBalance
      FROM dbo.Users u
      LEFT JOIN dbo.Shops s ON u.UserID = s.OwnerID
      WHERE u.UserID = @UserID
    `);
  if (res.recordset.length === 0) return null;
  const row = res.recordset[0];
  return {
    userId: row.UserID,
    fullName: row.FullName,
    email: row.Email,
    role: row.Role,
    address: row.Address,
    phone: row.Phone,
    avatarUrl: row.AvatarUrl,
    isActive: row.IsActive,
    createdAt: row.CreatedAt,
    shop: row.ShopID
      ? {
          shopId: row.ShopID,
          shopName: row.ShopName,
          approvalStatus: row.ShopStatus,
          shopType: row.ShopType,
          walletBalance: Number(row.WalletBalance || 0),
        }
      : null,
  };
};

/**
 * GET /api/auth/captcha
 * Sinh mã CAPTCHA dùng 1 lần ký bởi server (chống bot & chống replay)
 */
const getCaptcha = (req, res) => {
  const challenge = createCaptchaChallenge(5);
  res.json({
    success: true,
    data: challenge,
  });
};

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { fullName, email, password, phone, address, captchaToken, captchaInput } = req.body;

    const captchaCheck = verifyCaptchaChallenge(captchaToken, captchaInput);
    if (!captchaCheck.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CAPTCHA',
        message: captchaCheck.message,
      });
    }

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Họ tên, Email và Mật khẩu.',
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 6 ký tự.',
      });
    }

    const pool = await getPool();
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await pool
      .request()
      .input('Email', sql.VarChar(150), normalizedEmail)
      .query('SELECT UserID FROM dbo.Users WHERE Email = @Email');

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email này đã được sử dụng. Vui lòng chọn email khác.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertResult = await pool
      .request()
      .input('FullName', sql.NVarChar(150), fullName.trim())
      .input('Email', sql.VarChar(150), normalizedEmail)
      .input('PasswordHash', sql.VarChar(255), passwordHash)
      .input('Role', sql.NVarChar(20), 'Customer')
      .input('Address', sql.NVarChar(500), address || null)
      .input('Phone', sql.VarChar(20), phone || null)
      .query(`
        INSERT INTO dbo.Users (FullName, Email, PasswordHash, Role, Address, Phone)
        OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.Email, INSERTED.Role, ISNULL(INSERTED.TokenVersion, 0) AS TokenVersion
        VALUES (@FullName, @Email, @PasswordHash, @Role, @Address, @Phone)
      `);

    const created = insertResult.recordset[0];
    const token = generateToken(created);
    const userData = await fetchUserWithShop(pool, created.UserID);

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công! Chúc bạn năm mới đọc sách vui vẻ.',
      data: {
        token,
        user: userData,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password, captchaToken, captchaInput } = req.body;

    const captchaCheck = verifyCaptchaChallenge(captchaToken, captchaInput);
    if (!captchaCheck.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CAPTCHA',
        message: captchaCheck.message,
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập Email và Mật khẩu.',
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('Email', sql.VarChar(150), email.trim().toLowerCase())
      .query(`
        SELECT UserID, FullName, Email, PasswordHash, Role, IsActive, ISNULL(TokenVersion, 0) AS TokenVersion
        FROM dbo.Users
        WHERE Email = @Email
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.',
      });
    }

    const user = result.recordset[0];
    if (!user.IsActive) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị tạm khóa bởi Quản trị viên.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.PasswordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác.',
      });
    }

    const token = generateToken(user);
    const userData = await fetchUserWithShop(pool, user.UserID);

    res.json({
      success: true,
      message: 'Đăng nhập thành công.',
      data: {
        token,
        user: userData,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/social-login
 * Đã khóa để ngăn lỗ hổng Account Takeover (không chấp nhận email không có OAuth id_token xác thực).
 */
const socialLogin = (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Đăng nhập mạng xã hội yêu cầu cấu hình OAuth 2.0 (Google/Facebook) có xác thực chữ ký id_token ở máy chủ. Vui lòng đăng nhập bằng Email và Mật khẩu.',
  });
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const pool = await getPool();
    const userData = await fetchUserWithShop(pool, req.user.userId);
    if (!userData) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }
    res.json({ success: true, data: userData });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { fullName, phone, address, avatarUrl } = req.body;
    const pool = await getPool();

    await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .input('FullName', sql.NVarChar(150), fullName?.trim() || req.user.fullName)
      .input('Phone', sql.VarChar(20), phone || null)
      .input('Address', sql.NVarChar(500), address || null)
      .input('AvatarUrl', sql.VarChar(500), avatarUrl || null)
      .query(`
        UPDATE dbo.Users
        SET FullName = @FullName, Phone = @Phone, Address = @Address, AvatarUrl = @AvatarUrl
        WHERE UserID = @UserID
      `);

    const updated = await fetchUserWithShop(pool, req.user.userId);
    res.json({ success: true, message: 'Cập nhật hồ sơ thành công.', data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/change-password
 * Đổi mật khẩu + tăng TokenVersion để thu hồi phiên đăng nhập trên các thiết bị khác
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.',
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự.',
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
      });
    }

    const pool = await getPool();
    const userRes = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query('SELECT UserID, FullName, Email, Role, PasswordHash, ISNULL(TokenVersion, 0) AS TokenVersion FROM dbo.Users WHERE UserID = @UserID');

    if (userRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    }

    const user = userRes.recordset[0];
    const isMatch = await bcrypt.compare(currentPassword, user.PasswordHash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu hiện tại không chính xác.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    const nextTokenVersion = Number(user.TokenVersion || 0) + 1;

    await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .input('PasswordHash', sql.VarChar(255), newHash)
      .input('TokenVersion', sql.Int, nextTokenVersion)
      .query('UPDATE dbo.Users SET PasswordHash = @PasswordHash, TokenVersion = @TokenVersion WHERE UserID = @UserID');

    const freshToken = generateToken({ ...user, TokenVersion: nextTokenVersion });

    res.json({
      success: true,
      message: 'Đổi mật khẩu thành công! Các thiết bị đăng nhập cũ đã được tự động đăng xuất.',
      data: { token: freshToken },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout-all
 * Thu hồi toàn bộ JWT đang hoạt động trên mọi thiết bị
 */
const logoutAllDevices = async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query('UPDATE dbo.Users SET TokenVersion = ISNULL(TokenVersion, 0) + 1 WHERE UserID = @UserID');

    res.json({
      success: true,
      message: 'Đã đăng xuất tài khoản khỏi tất cả thiết bị thành công.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/forgot-password
 * Phát sinh mã OTP 6 số có hạn 10 phút (lưu dạng băm bcrypt trong DB)
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Email đã đăng ký.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const pool = await getPool();
    const userRes = await pool
      .request()
      .input('Email', sql.VarChar(150), normalizedEmail)
      .query('SELECT UserID, FullName, Email, IsActive FROM dbo.Users WHERE Email = @Email');

    // Luôn trả thông điệp chung để tránh lộ danh sách email tồn tại (ở production)
    if (userRes.recordset.length === 0 || !userRes.recordset[0].IsActive) {
      return res.json({
        success: true,
        message: 'Nếu email tồn tại và đang hoạt động, mã OTP khôi phục 6 số đã được gửi.',
      });
    }

    const user = userRes.recordset[0];
    const otpCode = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

    // Vô hiệu hóa các OTP cũ chưa dùng của tài khoản này
    await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .query('UPDATE dbo.PasswordResetTokens SET IsUsed = 1 WHERE UserID = @UserID AND IsUsed = 0');

    await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .input('OtpHash', sql.VarChar(255), otpHash)
      .input('ExpiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO dbo.PasswordResetTokens (UserID, OtpHash, ExpiresAt, IsUsed)
        VALUES (@UserID, @OtpHash, @ExpiresAt, 0)
      `);

    console.log(`[OTP RESET PASSWORD] Email: ${user.Email} | Mã OTP: ${otpCode} (hết hạn sau 10 phút)`);

    const isProd = process.env.NODE_ENV === 'production';
    res.json({
      success: true,
      message: 'Mã OTP 6 số đã được tạo (hiệu lực 10 phút). Vui lòng nhập mã để đặt lại mật khẩu.',
      data: isProd ? { expiresInMinutes: 10 } : { expiresInMinutes: 10, devOtp: otpCode },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/reset-password
 * Xác thực OTP 6 số -> cập nhật mật khẩu mới -> tăng TokenVersion thu hồi phiên cũ
 */
const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Email, mã OTP và Mật khẩu mới.',
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const pool = await getPool();

    const userRes = await pool
      .request()
      .input('Email', sql.VarChar(150), normalizedEmail)
      .query('SELECT UserID, IsActive FROM dbo.Users WHERE Email = @Email');

    if (userRes.recordset.length === 0 || !userRes.recordset[0].IsActive) {
      return res.status(400).json({ success: false, message: 'Mã OTP không hợp lệ hoặc đã hết hạn.' });
    }

    const user = userRes.recordset[0];
    const tokenRes = await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .query(`
        SELECT TOP 1 ResetID, OtpHash, ExpiresAt
        FROM dbo.PasswordResetTokens
        WHERE UserID = @UserID AND IsUsed = 0 AND ExpiresAt > SYSDATETIME()
        ORDER BY CreatedAt DESC
      `);

    if (tokenRes.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Mã OTP không tồn tại hoặc đã hết hạn.' });
    }

    const resetRecord = tokenRes.recordset[0];
    const otpValid = await bcrypt.compare(String(otp).trim(), resetRecord.OtpHash);
    if (!otpValid) {
      return res.status(400).json({ success: false, message: 'Mã OTP không chính xác. Vui lòng kiểm tra lại.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await pool
      .request()
      .input('UserID', sql.Int, user.UserID)
      .input('PasswordHash', sql.VarChar(255), newHash)
      .query('UPDATE dbo.Users SET PasswordHash = @PasswordHash, TokenVersion = ISNULL(TokenVersion, 0) + 1 WHERE UserID = @UserID');

    await pool
      .request()
      .input('ResetID', sql.Int, resetRecord.ResetID)
      .query('UPDATE dbo.PasswordResetTokens SET IsUsed = 1 WHERE ResetID = @ResetID');

    res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới ngay bây giờ.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCaptcha,
  register,
  login,
  socialLogin,
  getMe,
  updateProfile,
  changePassword,
  logoutAllDevices,
  forgotPassword,
  resetPassword,
};
