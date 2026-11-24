const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');
const { getJwtSecret } = require('../utils/security');

/**
 * Truy vấn nhanh trạng thái hiện tại của tài khoản để đảm bảo:
 * - Tài khoản bị Admin khóa (IsActive = 0) bị chặn ngay lập tức
 * - Quyền (Role) được cập nhật ngay theo DB thay vì chờ token hết hạn
 * - Token cũ bị thu hồi khi đổi mật khẩu / đăng xuất mọi thiết bị (TokenVersion)
 */
const loadActiveUserForToken = async (decoded) => {
  const pool = await getPool();
  const res = await pool
    .request()
    .input('UserID', sql.Int, decoded.userId)
    .query(`
      SELECT UserID, Email, Role, FullName, IsActive, ISNULL(TokenVersion, 0) AS TokenVersion
      FROM dbo.Users
      WHERE UserID = @UserID
    `);

  if (res.recordset.length === 0) return null;
  const dbUser = res.recordset[0];

  if (!dbUser.IsActive) {
    return { blocked: true, reason: 'Tài khoản của bạn đã bị tạm khóa bởi Quản trị viên.' };
  }

  const tokenVer = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;
  if (Number(dbUser.TokenVersion) !== tokenVer) {
    return { revoked: true, reason: 'Phiên đăng nhập đã hết hiệu lực hoặc đã bị đăng xuất. Vui lòng đăng nhập lại.' };
  }

  return {
    userId: dbUser.UserID,
    email: dbUser.Email,
    role: dbUser.Role,
    fullName: dbUser.FullName,
    tokenVersion: Number(dbUser.TokenVersion),
  };
};

/**
 * Middleware xác thực JWT Token bắt buộc (có kiểm tra IsActive & TokenVersion theo DB)
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Truy cập bị từ chối. Vui lòng đăng nhập để tiếp tục.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret());

    const resolved = await loadActiveUserForToken(decoded);
    if (!resolved) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại. Vui lòng đăng nhập lại.',
      });
    }
    if (resolved.blocked) {
      return res.status(403).json({ success: false, message: resolved.reason });
    }
    if (resolved.revoked) {
      return res.status(401).json({ success: false, message: resolved.reason });
    }

    req.user = resolved;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    });
  }
};

/**
 * Middleware xác thực JWT tùy chọn (dùng cho trang công khai muốn biết user đã Follow hay chưa)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, getJwtSecret());
      const resolved = await loadActiveUserForToken(decoded);
      if (resolved && !resolved.blocked && !resolved.revoked) {
        req.user = resolved;
      }
    }
  } catch (_) {}
  next();
};

module.exports = { authenticateToken, optionalAuth, loadActiveUserForToken };
