const { sql, getPool } = require('../config/db');
const { pushToUser, createNotification } = require('../utils/helpers');

/**
 * GET /api/chat/conversations
 * Lấy danh sách hội thoại mà người dùng hiện tại là Người mua hoặc Chủ Shop
 */
const getConversations = async (req, res, next) => {
  try {
    const pool = await getPool();
    const resData = await pool
      .request()
      .input('UserID', sql.Int, req.user.userId)
      .query(`
        SELECT
          c.ConversationID, c.BuyerID, c.ShopID, c.LastMessage, c.LastMessageAt,
          u.FullName AS BuyerName,
          s.ShopName, s.LogoUrl AS ShopLogo, s.OwnerID AS ShopOwnerID,
          (SELECT COUNT(*) FROM dbo.Messages m WHERE m.ConversationID = c.ConversationID AND m.SenderID <> @UserID AND m.IsRead = 0) AS UnreadCount
        FROM dbo.Conversations c
        INNER JOIN dbo.Users u ON c.BuyerID = u.UserID
        INNER JOIN dbo.Shops s ON c.ShopID = s.ShopID
        WHERE c.BuyerID = @UserID OR s.OwnerID = @UserID
        ORDER BY c.LastMessageAt DESC
      `);

    res.json({ success: true, data: resData.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/conversations
 * Bắt đầu hoặc mở lại hội thoại với 1 Shop
 */
const startOrGetConversation = async (req, res, next) => {
  try {
    const shopId = parseInt(req.body.shopId, 10);
    if (isNaN(shopId)) {
      return res.status(400).json({ success: false, message: 'ID Gian hàng không hợp lệ.' });
    }

    const pool = await getPool();
    const shopRes = await pool
      .request()
      .input('ShopID', sql.Int, shopId)
      .query('SELECT ShopID, ShopName, OwnerID FROM dbo.Shops WHERE ShopID = @ShopID');

    if (shopRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Gian hàng.' });
    }

    if (shopRes.recordset[0].OwnerID === req.user.userId) {
      return res.status(400).json({ success: false, message: 'Bạn không thể tự nhắn tin với Gian hàng của chính mình.' });
    }

    const existing = await pool
      .request()
      .input('BuyerID', sql.Int, req.user.userId)
      .input('ShopID', sql.Int, shopId)
      .query('SELECT * FROM dbo.Conversations WHERE BuyerID = @BuyerID AND ShopID = @ShopID');

    if (existing.recordset.length > 0) {
      return res.json({ success: true, data: existing.recordset[0] });
    }

    const created = await pool
      .request()
      .input('BuyerID', sql.Int, req.user.userId)
      .input('ShopID', sql.Int, shopId)
      .query(`
        INSERT INTO dbo.Conversations (BuyerID, ShopID, LastMessage)
        OUTPUT INSERTED.*
        VALUES (@BuyerID, @ShopID, N'Bắt đầu cuộc trò chuyện')
      `);

    res.status(201).json({ success: true, data: created.recordset[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chat/conversations/:id/messages
 */
const getMessages = async (req, res, next) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const convRes = await pool
      .request()
      .input('ConversationID', sql.Int, conversationId)
      .query(`
        SELECT c.*, s.OwnerID AS ShopOwnerID
        FROM dbo.Conversations c
        INNER JOIN dbo.Shops s ON c.ShopID = s.ShopID
        WHERE c.ConversationID = @ConversationID
      `);

    if (convRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hội thoại.' });
    }

    const conv = convRes.recordset[0];
    if (conv.BuyerID !== req.user.userId && conv.ShopOwnerID !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Bạn không thuộc hội thoại này.' });
    }

    await pool
      .request()
      .input('ConversationID', sql.Int, conversationId)
      .input('UserID', sql.Int, req.user.userId)
      .query('UPDATE dbo.Messages SET IsRead = 1 WHERE ConversationID = @ConversationID AND SenderID <> @UserID AND IsRead = 0');

    const msgsRes = await pool
      .request()
      .input('ConversationID', sql.Int, conversationId)
      .query(`
        SELECT m.*, u.FullName AS SenderName
        FROM dbo.Messages m
        INNER JOIN dbo.Users u ON m.SenderID = u.UserID
        WHERE m.ConversationID = @ConversationID
        ORDER BY m.CreatedAt ASC
      `);

    res.json({ success: true, data: msgsRes.recordset });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/conversations/:id/messages
 * Gửi tin nhắn & đẩy thời gian thực tới đối phương qua SSE
 */
const sendMessage = async (req, res, next) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung tin nhắn.' });
    }

    const pool = await getPool();
    const convRes = await pool
      .request()
      .input('ConversationID', sql.Int, conversationId)
      .query(`
        SELECT c.*, s.OwnerID AS ShopOwnerID, s.ShopName
        FROM dbo.Conversations c
        INNER JOIN dbo.Shops s ON c.ShopID = s.ShopID
        WHERE c.ConversationID = @ConversationID
      `);

    if (convRes.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hội thoại.' });
    }

    const conv = convRes.recordset[0];
    if (conv.BuyerID !== req.user.userId && conv.ShopOwnerID !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền gửi tin nhắn trong hội thoại này.' });
    }

    const text = content.trim();
    const insertRes = await pool
      .request()
      .input('ConversationID', sql.Int, conversationId)
      .input('SenderID', sql.Int, req.user.userId)
      .input('Content', sql.NVarChar(2000), text)
      .query(`
        INSERT INTO dbo.Messages (ConversationID, SenderID, Content)
        OUTPUT INSERTED.*
        VALUES (@ConversationID, @SenderID, @Content)
      `);

    await pool
      .request()
      .input('ConversationID', sql.Int, conversationId)
      .input('LastMessage', sql.NVarChar(500), text.slice(0, 500))
      .query('UPDATE dbo.Conversations SET LastMessage = @LastMessage, LastMessageAt = SYSDATETIME() WHERE ConversationID = @ConversationID');

    const msg = { ...insertRes.recordset[0], SenderName: req.user.fullName };
    const recipientId = req.user.userId === conv.BuyerID ? conv.ShopOwnerID : conv.BuyerID;

    pushToUser(recipientId, 'chat_message', msg);
    await createNotification(pool, {
      userId: recipientId,
      title: `Tin nhắn mới từ ${req.user.userId === conv.BuyerID ? req.user.fullName : conv.ShopName}`,
      message: text.slice(0, 100),
      type: 'Chat',
      linkUrl: '/chat',
    });

    res.status(201).json({ success: true, data: msg });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConversations,
  startOrGetConversation,
  getMessages,
  sendMessage,
};
