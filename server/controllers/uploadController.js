const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateImageMagicBytes } = require('../utils/security');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB mỗi ảnh

/**
 * POST /api/uploads/images
 * Nhận mảng ảnh dạng Data URL (base64) từ frontend, kiểm tra định dạng & kích thước,
 * lưu ra file thực tại server/uploads và trả về danh sách URL công khai.
 */
const uploadImages = async (req, res, next) => {
  try {
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất một tệp ảnh để tải lên.',
      });
    }

    if (images.length > 8) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ được tải lên tối đa 8 ảnh cùng lúc.',
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const savedUrls = [];

    for (const item of images) {
      const dataUrl = typeof item === 'string' ? item : item?.dataUrl;
      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Dữ liệu ảnh không hợp lệ.',
        });
      }

      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({
          success: false,
          message: 'Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG, WEBP hoặc GIF.',
        });
      }

      const mimeType = match[1].toLowerCase();
      const ext = ALLOWED_MIME_EXT[mimeType];
      if (!ext) {
        return res.status(400).json({
          success: false,
          message: `Định dạng ${mimeType} không được hỗ trợ.`,
        });
      }

      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return res.status(400).json({
          success: false,
          message: 'Mỗi ảnh không được vượt quá 5MB.',
        });
      }

      if (!validateImageMagicBytes(buffer, mimeType)) {
        return res.status(400).json({
          success: false,
          message: 'Tệp tải lên không phải ảnh hợp lệ (chữ ký nhị phân không khớp định dạng).',
        });
      }

      const fileName = `vitabook_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      await fs.promises.writeFile(filePath, buffer);

      savedUrls.push(`${baseUrl}/uploads/${fileName}`);
    }

    res.status(201).json({
      success: true,
      message: `Đã tải lên thành công ${savedUrls.length} ảnh.`,
      data: {
        urls: savedUrls,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadImages,
};
