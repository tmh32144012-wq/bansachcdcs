const { sql } = require('../config/db');

/**
 * Quản lý kết nối Server-Sent Events (SSE) theo UserID để đẩy Thông báo & Chat tức thời
 */
const sseClients = new Map();

const registerSseClient = (userId, res) => {
  const key = String(userId);
  if (!sseClients.has(key)) {
    sseClients.set(key, new Set());
  }
  sseClients.get(key).add(res);
};

const unregisterSseClient = (userId, res) => {
  const key = String(userId);
  const set = sseClients.get(key);
  if (set) {
    set.delete(res);
    if (set.size === 0) {
      sseClients.delete(key);
    }
  }
};

const pushToUser = (userId, eventName, payload) => {
  const key = String(userId);
  const clients = sseClients.get(key);
  if (!clients || clients.size === 0) return;

  const formatted = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(formatted);
    } catch (_) {
      clients.delete(res);
    }
  }
};

/**
 * Parse chuỗi JSON an toàn (dùng cho GalleryImages, PreviewImages, EvidenceImages)
 */
const safeJsonParse = (str, fallback = []) => {
  if (!str) return fallback;
  if (Array.isArray(str)) return str;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Đọc giá trị cấu hình hệ thống từ bảng SystemSettings
 */
const getSystemSetting = async (poolOrTx, key, fallback) => {
  try {
    const request = poolOrTx instanceof sql.Transaction ? new sql.Request(poolOrTx) : poolOrTx.request();
    const res = await request
      .input('SettingKey', sql.VarChar(100), key)
      .query('SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = @SettingKey');
    if (res.recordset.length > 0) {
      return res.recordset[0].SettingValue;
    }
  } catch (_) {}
  return fallback;
};

/**
 * Tạo thông báo trong DB và đẩy realtime qua SSE
 */
const createNotification = async (poolOrTx, { userId, title, message, type = 'System', linkUrl = null }) => {
  if (!userId) return;
  try {
    const request = poolOrTx instanceof sql.Transaction ? new sql.Request(poolOrTx) : poolOrTx.request();
    const res = await request
      .input('UserID', sql.Int, userId)
      .input('Title', sql.NVarChar(200), title)
      .input('Message', sql.NVarChar(500), message)
      .input('Type', sql.NVarChar(50), type)
      .input('LinkUrl', sql.VarChar(300), linkUrl)
      .query(`
        INSERT INTO dbo.Notifications (UserID, Title, Message, Type, LinkUrl)
        OUTPUT INSERTED.*
        VALUES (@UserID, @Title, @Message, @Type, @LinkUrl)
      `);

    if (res.recordset[0]) {
      pushToUser(userId, 'notification', res.recordset[0]);
    }
  } catch (err) {
    console.error('[Notification Error]:', err.message);
  }
};

/**
 * Gửi thông báo cho toàn bộ Manager và Admin
 */
const notifyManagers = async (pool, { title, message, type = 'System', linkUrl = '/manager' }) => {
  try {
    const staffRes = await pool
      .request()
      .query("SELECT UserID FROM dbo.Users WHERE Role IN (N'Manager', N'Admin') AND IsActive = 1");
    for (const row of staffRes.recordset) {
      await createNotification(pool, {
        userId: row.UserID,
        title,
        message,
        type,
        linkUrl,
      });
    }
  } catch (err) {
    console.error('[NotifyManagers Error]:', err.message);
  }
};

/**
 * Ghi nhật ký kiểm duyệt & quản trị (AuditLog)
 */
const createAuditLog = async (poolOrTx, { actorId, actorRole, action, targetType, targetId = null, details = null }) => {
  try {
    const request = poolOrTx instanceof sql.Transaction ? new sql.Request(poolOrTx) : poolOrTx.request();
    await request
      .input('ActorID', sql.Int, actorId)
      .input('ActorRole', sql.NVarChar(20), actorRole)
      .input('Action', sql.NVarChar(100), action)
      .input('TargetType', sql.NVarChar(50), targetType)
      .input('TargetID', sql.Int, targetId)
      .input('Details', sql.NVarChar(1000), details)
      .query(`
        INSERT INTO dbo.AuditLogs (ActorID, ActorRole, Action, TargetType, TargetID, Details)
        VALUES (@ActorID, @ActorRole, @Action, @TargetType, @TargetID, @Details)
      `);
  } catch (err) {
    console.error('[AuditLog Error]:', err.message);
  }
};

module.exports = {
  registerSseClient,
  unregisterSseClient,
  pushToUser,
  safeJsonParse,
  getSystemSetting,
  createNotification,
  notifyManagers,
  createAuditLog,
};
