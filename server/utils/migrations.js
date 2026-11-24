/**
 * Migration an toàn (idempotent) chạy khi khởi động server:
 * - Bổ sung cột TokenVersion vào bảng dbo.Users để thu hồi phiên đăng nhập tức thời
 * - Tạo bảng dbo.PasswordResetTokens cho luồng Quên mật khẩu bằng mã OTP 6 số
 */
const runSafeMigrations = async (pool) => {
  try {
    await pool.request().query(`
      IF COL_LENGTH('dbo.Users', 'TokenVersion') IS NULL
      BEGIN
          ALTER TABLE dbo.Users
          ADD TokenVersion INT NOT NULL CONSTRAINT DF_Users_TokenVersion DEFAULT 0;
      END;

      IF OBJECT_ID('dbo.PasswordResetTokens', 'U') IS NULL
      BEGIN
          CREATE TABLE dbo.PasswordResetTokens (
              ResetID INT IDENTITY(1,1) PRIMARY KEY,
              UserID INT NOT NULL,
              OtpHash VARCHAR(255) NOT NULL,
              ExpiresAt DATETIME2 NOT NULL,
              IsUsed BIT NOT NULL DEFAULT 0,
              CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
              CONSTRAINT FK_PasswordResetTokens_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID) ON DELETE CASCADE
          );
          CREATE INDEX IX_PasswordResetTokens_UserID ON dbo.PasswordResetTokens(UserID, IsUsed, ExpiresAt);
      END;

      IF OBJECT_ID('dbo.QrPaymentSessions', 'U') IS NULL
      BEGIN
          CREATE TABLE dbo.QrPaymentSessions (
              SessionID INT IDENTITY(1,1) PRIMARY KEY,
              PaymentToken VARCHAR(64) NOT NULL UNIQUE,
              OrderGroupCode VARCHAR(50) NOT NULL,
              UserID INT NOT NULL,
              TotalAmount DECIMAL(18,2) NOT NULL,
              PaymentMethod NVARCHAR(50) NOT NULL,
              Status NVARCHAR(20) NOT NULL DEFAULT N'Pending' CHECK (Status IN (N'Pending', N'Paid', N'Expired', N'Cancelled')),
              ExpiresAt DATETIME2 NOT NULL,
              PaidAt DATETIME2 NULL,
              CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
              CONSTRAINT FK_QrPaymentSessions_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID)
          );
          CREATE INDEX IX_QrPaymentSessions_OrderGroup ON dbo.QrPaymentSessions(OrderGroupCode, Status);
      END;

      IF OBJECT_ID('dbo.CartItems', 'U') IS NULL
      BEGIN
          CREATE TABLE dbo.CartItems (
              UserID INT NOT NULL,
              BookID INT NOT NULL,
              Quantity INT NOT NULL DEFAULT 1 CHECK (Quantity > 0),
              Selected BIT NOT NULL DEFAULT 1,
              UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
              CONSTRAINT PK_CartItems PRIMARY KEY (UserID, BookID),
              CONSTRAINT FK_CartItems_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
              CONSTRAINT FK_CartItems_Book FOREIGN KEY (BookID) REFERENCES dbo.Books(BookID) ON DELETE CASCADE
          );
      END;

      IF OBJECT_ID('dbo.BookQuestions', 'U') IS NULL
      BEGIN
          CREATE TABLE dbo.BookQuestions (
              QuestionID INT IDENTITY(1,1) PRIMARY KEY,
              BookID INT NOT NULL,
              UserID INT NOT NULL,
              Question NVARCHAR(600) NOT NULL,
              Answer NVARCHAR(1000) NULL,
              AnsweredBy INT NULL,
              AnsweredAt DATETIME2 NULL,
              CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
              CONSTRAINT FK_BookQuestions_Book FOREIGN KEY (BookID) REFERENCES dbo.Books(BookID) ON DELETE CASCADE,
              CONSTRAINT FK_BookQuestions_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
              CONSTRAINT FK_BookQuestions_AnsweredBy FOREIGN KEY (AnsweredBy) REFERENCES dbo.Users(UserID)
          );
          CREATE INDEX IX_BookQuestions_BookID ON dbo.BookQuestions(BookID, CreatedAt DESC);
      END;

      -- Cập nhật mã khuyến mãi Tết mẫu sang Xuân Đinh Mùi 2027 (nếu DB cũ đang có TET2026)
      IF EXISTS (SELECT 1 FROM dbo.Vouchers WHERE Code = 'TET2026')
         AND NOT EXISTS (SELECT 1 FROM dbo.Vouchers WHERE Code = 'TET2027')
      BEGIN
          UPDATE dbo.Vouchers
          SET Code = 'TET2027',
              Title = N'Lì Xì Khai Xuân Đinh Mùi 2027 - Giảm 15% toàn sàn'
          WHERE Code = 'TET2026';
      END;
    `);
    console.log('[Migrations] Kiểm tra và đồng bộ cấu trúc bảng bảo mật thành công.');
  } catch (err) {
    console.error('[Migrations] Lỗi khi chạy migration an toàn:', err.message);
  }
};

module.exports = { runSafeMigrations };
