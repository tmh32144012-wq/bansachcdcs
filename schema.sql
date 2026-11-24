-- ============================================================================
-- VITABOOK MARKETPLACE (TẾT CỔ TRUYỀN) - SQL SERVER SCHEMA & SEED DATA
-- Sàn TMĐT Chuyên Sách (Multi-Vendor Marketplace: Customer / Seller / Manager / Admin)
-- Chạy trực tiếp trên SQL Server Management Studio (SSMS) bằng F5
-- ============================================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'BookstoreDB')
BEGIN
    CREATE DATABASE BookstoreDB;
END
GO

USE BookstoreDB;
GO

-- ============================================================================
-- XÓA CÁC BẢNG CŨ THEO THỨ TỰ KHÓA NGOẠI NGƯỢC LẠI ĐỂ DỄ CHẠY LẠI SCRIPT
-- ============================================================================
IF OBJECT_ID('dbo.AuditLogs', 'U') IS NOT NULL DROP TABLE dbo.AuditLogs;
IF OBJECT_ID('dbo.BookQuestions', 'U') IS NOT NULL DROP TABLE dbo.BookQuestions;
IF OBJECT_ID('dbo.CartItems', 'U') IS NOT NULL DROP TABLE dbo.CartItems;
IF OBJECT_ID('dbo.QrPaymentSessions', 'U') IS NOT NULL DROP TABLE dbo.QrPaymentSessions;
IF OBJECT_ID('dbo.PasswordResetTokens', 'U') IS NOT NULL DROP TABLE dbo.PasswordResetTokens;
IF OBJECT_ID('dbo.Messages', 'U') IS NOT NULL DROP TABLE dbo.Messages;
IF OBJECT_ID('dbo.Conversations', 'U') IS NOT NULL DROP TABLE dbo.Conversations;
IF OBJECT_ID('dbo.Notifications', 'U') IS NOT NULL DROP TABLE dbo.Notifications;
IF OBJECT_ID('dbo.Wishlists', 'U') IS NOT NULL DROP TABLE dbo.Wishlists;
IF OBJECT_ID('dbo.ShopFollowers', 'U') IS NOT NULL DROP TABLE dbo.ShopFollowers;
IF OBJECT_ID('dbo.WalletTransactions', 'U') IS NOT NULL DROP TABLE dbo.WalletTransactions;
IF OBJECT_ID('dbo.Disputes', 'U') IS NOT NULL DROP TABLE dbo.Disputes;
IF OBJECT_ID('dbo.Reviews', 'U') IS NOT NULL DROP TABLE dbo.Reviews;
IF OBJECT_ID('dbo.OrderTrackingEvents', 'U') IS NOT NULL DROP TABLE dbo.OrderTrackingEvents;
IF OBJECT_ID('dbo.OrderDetails', 'U') IS NOT NULL DROP TABLE dbo.OrderDetails;
IF OBJECT_ID('dbo.Orders', 'U') IS NOT NULL DROP TABLE dbo.Orders;
IF OBJECT_ID('dbo.Vouchers', 'U') IS NOT NULL DROP TABLE dbo.Vouchers;
IF OBJECT_ID('dbo.BookCategories', 'U') IS NOT NULL DROP TABLE dbo.BookCategories;
IF OBJECT_ID('dbo.BookAuthors', 'U') IS NOT NULL DROP TABLE dbo.BookAuthors;
IF OBJECT_ID('dbo.Books', 'U') IS NOT NULL DROP TABLE dbo.Books;
IF OBJECT_ID('dbo.Publishers', 'U') IS NOT NULL DROP TABLE dbo.Publishers;
IF OBJECT_ID('dbo.Authors', 'U') IS NOT NULL DROP TABLE dbo.Authors;
IF OBJECT_ID('dbo.Categories', 'U') IS NOT NULL DROP TABLE dbo.Categories;
IF OBJECT_ID('dbo.Shops', 'U') IS NOT NULL DROP TABLE dbo.Shops;
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
IF OBJECT_ID('dbo.SystemSettings', 'U') IS NOT NULL DROP TABLE dbo.SystemSettings;
GO

-- ============================================================================
-- 1. CẤU HÌNH HỆ THỐNG (SystemSettings)
-- ============================================================================
CREATE TABLE dbo.SystemSettings (
    SettingKey VARCHAR(100) PRIMARY KEY,
    SettingValue NVARCHAR(500) NOT NULL,
    Description NVARCHAR(300) NULL,
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- ============================================================================
-- 2. NGƯỜI DÙNG (Users: Customer / Manager / Admin)
-- ============================================================================
CREATE TABLE dbo.Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    FullName NVARCHAR(150) NOT NULL,
    Email VARCHAR(150) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Role NVARCHAR(20) NOT NULL DEFAULT N'Customer' CHECK (Role IN (N'Customer', N'Manager', N'Admin')),
    Address NVARCHAR(500) NULL,
    Phone VARCHAR(20) NULL,
    AvatarUrl VARCHAR(500) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    TokenVersion INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE TABLE dbo.PasswordResetTokens (
    ResetID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    OtpHash VARCHAR(255) NOT NULL,
    ExpiresAt DATETIME2 NOT NULL,
    IsUsed BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_PasswordResetTokens_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID) ON DELETE CASCADE
);
GO

-- ============================================================================
-- 3. GIAN HÀNG / SHOP NGƯỜI BÁN (Shops - Cần Manager duyệt)
-- ============================================================================
CREATE TABLE dbo.Shops (
    ShopID INT IDENTITY(1,1) PRIMARY KEY,
    OwnerID INT NOT NULL UNIQUE,
    ShopName NVARCHAR(150) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    LogoUrl VARCHAR(500) NULL,
    BannerUrl VARCHAR(500) NULL,
    PickupAddress NVARCHAR(500) NOT NULL,
    Phone VARCHAR(20) NOT NULL,
    ShopType NVARCHAR(50) NOT NULL DEFAULT N'Individual' CHECK (ShopType IN (N'Official', N'Bookstore', N'Individual')),
    ApprovalStatus NVARCHAR(20) NOT NULL DEFAULT N'Pending' CHECK (ApprovalStatus IN (N'Pending', N'Approved', N'Rejected', N'Suspended')),
    ReviewedBy INT NULL,
    ReviewedAt DATETIME2 NULL,
    RejectionReason NVARCHAR(500) NULL,
    WalletBalance DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (WalletBalance >= 0),
    PendingBalance DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (PendingBalance >= 0),
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Shops_Owner FOREIGN KEY (OwnerID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_Shops_Reviewer FOREIGN KEY (ReviewedBy) REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================================
-- 4. DANH MỤC SÁCH (Categories - Đa cấp)
-- ============================================================================
CREATE TABLE dbo.Categories (
    CategoryID INT IDENTITY(1,1) PRIMARY KEY,
    CategoryName NVARCHAR(100) NOT NULL,
    ParentID INT NULL,
    CONSTRAINT FK_Categories_Parent FOREIGN KEY (ParentID) REFERENCES dbo.Categories(CategoryID)
);
GO

-- ============================================================================
-- 5. TÁC GIẢ (Authors) & NHÀ XUẤT BẢN (Publishers)
-- ============================================================================
CREATE TABLE dbo.Authors (
    AuthorID INT IDENTITY(1,1) PRIMARY KEY,
    AuthorName NVARCHAR(150) NOT NULL,
    Bio NVARCHAR(MAX) NULL
);
GO

CREATE TABLE dbo.Publishers (
    PublisherID INT IDENTITY(1,1) PRIMARY KEY,
    PublisherName NVARCHAR(150) NOT NULL
);
GO

-- ============================================================================
-- 6. SÁCH (Books - Multi-Vendor + Kiểm duyệt + Ảnh đọc thử + Flash Sale)
-- Lưu ý: Bỏ UNIQUE toàn cục trên ISBN để nhiều Shop cùng bán được 1 đầu sách
-- ============================================================================
CREATE TABLE dbo.Books (
    BookID INT IDENTITY(1,1) PRIMARY KEY,
    ShopID INT NOT NULL,
    SellerID INT NOT NULL,
    Title NVARCHAR(250) NOT NULL,
    ISBN VARCHAR(30) NOT NULL,
    Price DECIMAL(18,2) NOT NULL CHECK (Price >= 0),
    DiscountPrice DECIMAL(18,2) NULL CHECK (DiscountPrice >= 0),
    Stock INT NOT NULL DEFAULT 0 CHECK (Stock >= 0),
    SoldCount INT NOT NULL DEFAULT 0,
    Description NVARCHAR(MAX) NULL,
    CoverImage VARCHAR(500) NULL,
    GalleryImages NVARCHAR(MAX) NULL,
    PreviewImages NVARCHAR(MAX) NULL,
    PageCount INT NULL CHECK (PageCount > 0),
    PublicationYear INT NULL,
    Format NVARCHAR(50) NULL DEFAULT N'Bìa mềm',
    BookCondition NVARCHAR(60) NOT NULL DEFAULT N'Mới 100%',
    Language NVARCHAR(50) NULL DEFAULT N'Tiếng Việt',
    PublisherID INT NULL,
    ApprovalStatus NVARCHAR(20) NOT NULL DEFAULT N'Pending' CHECK (ApprovalStatus IN (N'Pending', N'Approved', N'Rejected', N'Suspended', N'Hidden')),
    ReviewedBy INT NULL,
    ReviewedAt DATETIME2 NULL,
    RejectionReason NVARCHAR(500) NULL,
    IsFlashSale BIT NOT NULL DEFAULT 0,
    FlashSalePrice DECIMAL(18,2) NULL CHECK (FlashSalePrice >= 0),
    FlashSaleEnd DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Books_Shop FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID),
    CONSTRAINT FK_Books_Seller FOREIGN KEY (SellerID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_Books_Publishers FOREIGN KEY (PublisherID) REFERENCES dbo.Publishers(PublisherID) ON DELETE SET NULL,
    CONSTRAINT FK_Books_Reviewer FOREIGN KEY (ReviewedBy) REFERENCES dbo.Users(UserID)
);
GO

CREATE TABLE dbo.BookAuthors (
    BookID INT NOT NULL,
    AuthorID INT NOT NULL,
    CONSTRAINT PK_BookAuthors PRIMARY KEY (BookID, AuthorID),
    CONSTRAINT FK_BookAuthors_Books FOREIGN KEY (BookID) REFERENCES dbo.Books(BookID) ON DELETE CASCADE,
    CONSTRAINT FK_BookAuthors_Authors FOREIGN KEY (AuthorID) REFERENCES dbo.Authors(AuthorID) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.BookCategories (
    BookID INT NOT NULL,
    CategoryID INT NOT NULL,
    CONSTRAINT PK_BookCategories PRIMARY KEY (BookID, CategoryID),
    CONSTRAINT FK_BookCategories_Books FOREIGN KEY (BookID) REFERENCES dbo.Books(BookID) ON DELETE CASCADE,
    CONSTRAINT FK_BookCategories_Categories FOREIGN KEY (CategoryID) REFERENCES dbo.Categories(CategoryID) ON DELETE CASCADE
);
GO

-- ============================================================================
-- 7. VOUCHER KHUYẾN MÃI 2 TẦNG (Sàn / Freeship / Shop)
-- ============================================================================
CREATE TABLE dbo.Vouchers (
    VoucherID INT IDENTITY(1,1) PRIMARY KEY,
    Code VARCHAR(50) NOT NULL UNIQUE,
    Title NVARCHAR(150) NOT NULL,
    Scope NVARCHAR(20) NOT NULL CHECK (Scope IN (N'Platform', N'Shop', N'Freeship')),
    ShopID INT NULL,
    DiscountType NVARCHAR(20) NOT NULL CHECK (DiscountType IN (N'Percent', N'Fixed')),
    DiscountValue DECIMAL(18,2) NOT NULL CHECK (DiscountValue > 0),
    MaxDiscount DECIMAL(18,2) NULL,
    MinOrderValue DECIMAL(18,2) NOT NULL DEFAULT 0,
    UsageLimit INT NOT NULL DEFAULT 100,
    UsedCount INT NOT NULL DEFAULT 0,
    StartDate DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    EndDate DATETIME2 NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedBy INT NULL,
    CONSTRAINT FK_Vouchers_Shop FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID),
    CONSTRAINT FK_Vouchers_Creator FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================================
-- 8. ĐƠN HÀNG (Tách theo từng Shop, COD & Trả trước, Phí hoa hồng, Escrow)
-- ============================================================================
CREATE TABLE dbo.Orders (
    OrderID INT IDENTITY(1,1) PRIMARY KEY,
    OrderGroupCode VARCHAR(50) NULL,
    UserID INT NOT NULL,
    ShopID INT NOT NULL,
    Subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
    ShippingFee DECIMAL(18,2) NOT NULL DEFAULT 0,
    ShippingMethod NVARCHAR(50) NOT NULL DEFAULT N'Standard',
    ShopDiscount DECIMAL(18,2) NOT NULL DEFAULT 0,
    PlatformDiscount DECIMAL(18,2) NOT NULL DEFAULT 0,
    ShopVoucherCode VARCHAR(50) NULL,
    PlatformVoucherCode VARCHAR(50) NULL,
    TotalAmount DECIMAL(18,2) NOT NULL CHECK (TotalAmount >= 0),
    CommissionRate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    CommissionAmount DECIMAL(18,2) NOT NULL DEFAULT 0,
    SellerNetAmount DECIMAL(18,2) NOT NULL DEFAULT 0,
    IsSettled BIT NOT NULL DEFAULT 0,
    ShippingAddress NVARCHAR(500) NOT NULL,
    Phone VARCHAR(20) NOT NULL,
    Note NVARCHAR(500) NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT N'Pending' CHECK (Status IN (N'Pending', N'Confirmed', N'Packing', N'Shipping', N'Delivered', N'Completed', N'Cancelled', N'Disputed', N'Refunded')),
    PaymentType NVARCHAR(20) NOT NULL DEFAULT N'COD' CHECK (PaymentType IN (N'COD', N'Prepaid')),
    PaymentMethod NVARCHAR(50) NOT NULL DEFAULT N'COD',
    PaymentStatus NVARCHAR(50) NOT NULL DEFAULT N'Unpaid' CHECK (PaymentStatus IN (N'Unpaid', N'Paid', N'Escrow', N'Refunded')),
    TrackingNumber VARCHAR(50) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Orders_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_Orders_Shops FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID)
);
GO

CREATE TABLE dbo.OrderDetails (
    OrderDetailID INT IDENTITY(1,1) PRIMARY KEY,
    OrderID INT NOT NULL,
    BookID INT NOT NULL,
    UnitPrice DECIMAL(18,2) NOT NULL CHECK (UnitPrice >= 0),
    Quantity INT NOT NULL CHECK (Quantity > 0),
    CONSTRAINT FK_OrderDetails_Orders FOREIGN KEY (OrderID) REFERENCES dbo.Orders(OrderID) ON DELETE CASCADE,
    CONSTRAINT FK_OrderDetails_Books FOREIGN KEY (BookID) REFERENCES dbo.Books(BookID)
);
GO

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
GO

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
GO

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
GO

-- ============================================================================
-- 9. HÀNH TRÌNH VẬN CHUYỂN (Manager cập nhật chi tiết, khách hàng theo dõi)
-- ============================================================================
CREATE TABLE dbo.OrderTrackingEvents (
    EventID INT IDENTITY(1,1) PRIMARY KEY,
    OrderID INT NOT NULL,
    Stage NVARCHAR(50) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Location NVARCHAR(250) NULL,
    Description NVARCHAR(500) NULL,
    UpdatedBy INT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Tracking_Orders FOREIGN KEY (OrderID) REFERENCES dbo.Orders(OrderID) ON DELETE CASCADE,
    CONSTRAINT FK_Tracking_Users FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================================
-- 10. ĐÁNH GIÁ SÁCH (Reviews - Verified Purchase + Phản hồi Shop + Kiểm duyệt)
-- ============================================================================
CREATE TABLE dbo.Reviews (
    ReviewID INT IDENTITY(1,1) PRIMARY KEY,
    BookID INT NOT NULL,
    ShopID INT NOT NULL,
    UserID INT NOT NULL,
    OrderID INT NOT NULL,
    Rating INT NOT NULL CHECK (Rating BETWEEN 1 AND 5),
    Comment NVARCHAR(1000) NULL,
    Images NVARCHAR(MAX) NULL,
    SellerReply NVARCHAR(1000) NULL,
    SellerRepliedAt DATETIME2 NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Visible' CHECK (Status IN (N'Visible', N'Hidden', N'Reported')),
    ReportReason NVARCHAR(300) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Reviews_Books FOREIGN KEY (BookID) REFERENCES dbo.Books(BookID),
    CONSTRAINT FK_Reviews_Shops FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID),
    CONSTRAINT FK_Reviews_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_Reviews_Orders FOREIGN KEY (OrderID) REFERENCES dbo.Orders(OrderID)
);
GO

-- ============================================================================
-- 11. KHIẾU NẠI / TRẢ HÀNG HOÀN TIỀN (Disputes - Manager phân xử)
-- ============================================================================
CREATE TABLE dbo.Disputes (
    DisputeID INT IDENTITY(1,1) PRIMARY KEY,
    OrderID INT NOT NULL,
    BuyerID INT NOT NULL,
    ShopID INT NOT NULL,
    Reason NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    EvidenceImages NVARCHAR(MAX) NULL,
    RequestedAction NVARCHAR(50) NOT NULL DEFAULT N'ReturnAndRefund',
    Status NVARCHAR(30) NOT NULL DEFAULT N'Open' CHECK (Status IN (N'Open', N'Reviewing', N'ResolvedRefund', N'ResolvedReject')),
    ManagerID INT NULL,
    ResolutionNote NVARCHAR(1000) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    ResolvedAt DATETIME2 NULL,
    CONSTRAINT FK_Disputes_Orders FOREIGN KEY (OrderID) REFERENCES dbo.Orders(OrderID),
    CONSTRAINT FK_Disputes_Buyer FOREIGN KEY (BuyerID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_Disputes_Shop FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID),
    CONSTRAINT FK_Disputes_Manager FOREIGN KEY (ManagerID) REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================================
-- 12. VÍ NGƯỜI BÁN & ĐỐI SOÁT HOA HỒNG (WalletTransactions)
-- ============================================================================
CREATE TABLE dbo.WalletTransactions (
    TransactionID INT IDENTITY(1,1) PRIMARY KEY,
    ShopID INT NOT NULL,
    OrderID INT NULL,
    Type NVARCHAR(30) NOT NULL CHECK (Type IN (N'OrderSettlement', N'CommissionFee', N'Withdrawal', N'RefundDeduction')),
    Amount DECIMAL(18,2) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT N'Completed' CHECK (Status IN (N'Pending', N'Completed', N'Rejected')),
    BankInfo NVARCHAR(300) NULL,
    Note NVARCHAR(500) NULL,
    ProcessedBy INT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Wallet_Shop FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID),
    CONSTRAINT FK_Wallet_Order FOREIGN KEY (OrderID) REFERENCES dbo.Orders(OrderID),
    CONSTRAINT FK_Wallet_Admin FOREIGN KEY (ProcessedBy) REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================================
-- 13. THEO DÕI SHOP (ShopFollowers) & SÁCH YÊU THÍCH (Wishlists)
-- ============================================================================
CREATE TABLE dbo.ShopFollowers (
    UserID INT NOT NULL,
    ShopID INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_ShopFollowers PRIMARY KEY (UserID, ShopID),
    CONSTRAINT FK_ShopFollowers_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
    CONSTRAINT FK_ShopFollowers_Shop FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.Wishlists (
    UserID INT NOT NULL,
    BookID INT NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_Wishlists PRIMARY KEY (UserID, BookID),
    CONSTRAINT FK_Wishlists_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID) ON DELETE CASCADE,
    CONSTRAINT FK_Wishlists_Book FOREIGN KEY (BookID) REFERENCES dbo.Books(BookID) ON DELETE CASCADE
);
GO

-- ============================================================================
-- 14. THÔNG BÁO (Notifications), CHAT (Conversations & Messages) & AUDIT LOGS
-- ============================================================================
CREATE TABLE dbo.Notifications (
    NotificationID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Message NVARCHAR(500) NOT NULL,
    Type NVARCHAR(50) NOT NULL DEFAULT N'System',
    LinkUrl VARCHAR(300) NULL,
    IsRead BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Notifications_User FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.Conversations (
    ConversationID INT IDENTITY(1,1) PRIMARY KEY,
    BuyerID INT NOT NULL,
    ShopID INT NOT NULL,
    LastMessage NVARCHAR(500) NULL,
    LastMessageAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_Conversation_BuyerShop UNIQUE (BuyerID, ShopID),
    CONSTRAINT FK_Conversations_Buyer FOREIGN KEY (BuyerID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_Conversations_Shop FOREIGN KEY (ShopID) REFERENCES dbo.Shops(ShopID)
);
GO

CREATE TABLE dbo.Messages (
    MessageID INT IDENTITY(1,1) PRIMARY KEY,
    ConversationID INT NOT NULL,
    SenderID INT NOT NULL,
    Content NVARCHAR(2000) NOT NULL,
    IsRead BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Messages_Conversation FOREIGN KEY (ConversationID) REFERENCES dbo.Conversations(ConversationID) ON DELETE CASCADE,
    CONSTRAINT FK_Messages_Sender FOREIGN KEY (SenderID) REFERENCES dbo.Users(UserID)
);
GO

CREATE TABLE dbo.AuditLogs (
    LogID INT IDENTITY(1,1) PRIMARY KEY,
    ActorID INT NOT NULL,
    ActorRole NVARCHAR(20) NOT NULL,
    Action NVARCHAR(100) NOT NULL,
    TargetType NVARCHAR(50) NOT NULL,
    TargetID INT NULL,
    Details NVARCHAR(1000) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_AuditLogs_Actor FOREIGN KEY (ActorID) REFERENCES dbo.Users(UserID)
);
GO

-- ============================================================================
-- CHỈ MỤC TỐI ƯU HIỆU NĂNG (INDEXES)
-- ============================================================================
CREATE INDEX IX_Books_Title ON dbo.Books(Title);
CREATE INDEX IX_Books_Shop_Status ON dbo.Books(ShopID, ApprovalStatus);
CREATE INDEX IX_Books_ApprovalStatus ON dbo.Books(ApprovalStatus);
CREATE INDEX IX_Orders_UserID ON dbo.Orders(UserID);
CREATE INDEX IX_Orders_ShopID ON dbo.Orders(ShopID);
CREATE INDEX IX_Tracking_OrderID ON dbo.OrderTrackingEvents(OrderID);
CREATE INDEX IX_Notifications_UserID ON dbo.Notifications(UserID, IsRead);
GO

-- ============================================================================
-- 15. DỮ LIỆU MẪU (SEED DATA - KHÔNG KHÍ TẾT CỔ TRUYỀN VIỆT NAM)
-- Mật khẩu chung cho tất cả tài khoản mẫu: 123456
-- ============================================================================

-- 15.1. Cấu hình sàn
INSERT INTO dbo.SystemSettings (SettingKey, SettingValue, Description)
VALUES
('CommissionRate', N'5', N'Phần trăm phí hoa hồng sàn thu trên mỗi đơn hàng hoàn tất (%)'),
('ShippingFeeEconomy', N'15000', N'Phí giao hàng Tiết kiệm (VNĐ)'),
('ShippingFeeStandard', N'30000', N'Phí giao hàng Nhanh (VNĐ)'),
('ShippingFeeExpress', N'50000', N'Phí giao hàng Hỏa tốc trong ngày (VNĐ)');
GO

-- 15.2. Tài khoản mẫu (Mật khẩu: 123456)
INSERT INTO dbo.Users (FullName, Email, PasswordHash, Role, Address, Phone)
VALUES
(N'Quản Trị Viên Sàn', 'admin@bookstore.vn', '$2a$10$Hv7aN.3q1Mp.bHdsMcUQSeJn4KDVq1g.nm8hNNGSwMISqFD2Kjugi', N'Admin', N'Tầng 12, Tòa nhà Xuân Việt, Quận 1, TP.HCM', '0901234567'),
(N'Trần Minh Quản Lý', 'manager@bookstore.vn', '$2a$10$Hv7aN.3q1Mp.bHdsMcUQSeJn4KDVq1g.nm8hNNGSwMISqFD2Kjugi', N'Manager', N'88 Lê Lợi, Quận 1, TP.HCM', '0909888777'),
(N'Nguyễn Văn Khách', 'khachhang@bookstore.vn', '$2a$10$Hv7aN.3q1Mp.bHdsMcUQSeJn4KDVq1g.nm8hNNGSwMISqFD2Kjugi', N'Customer', N'123 Nguyễn Huệ, Quận 1, TP.HCM', '0987654321'),
(N'Chủ Hiệu Sách Xuân An', 'shopxuanan@bookstore.vn', '$2a$10$Hv7aN.3q1Mp.bHdsMcUQSeJn4KDVq1g.nm8hNNGSwMISqFD2Kjugi', N'Customer', N'45 Đinh Lễ, Hoàn Kiếm, Hà Nội', '0912345678'),
(N'Chủ Tiệm Sách Cũ Sài Gòn', 'shopsachcu@bookstore.vn', '$2a$10$Hv7aN.3q1Mp.bHdsMcUQSeJn4KDVq1g.nm8hNNGSwMISqFD2Kjugi', N'Customer', N'210 Trần Nhân Tôn, Quận 10, TP.HCM', '0938112233'),
(N'Lê Thị Mai (Chờ duyệt Shop)', 'dangkyshop@bookstore.vn', '$2a$10$Hv7aN.3q1Mp.bHdsMcUQSeJn4KDVq1g.nm8hNNGSwMISqFD2Kjugi', N'Customer', N'15 Pasteur, Hải Châu, Đà Nẵng', '0977554433');
GO

-- 15.3. Gian hàng mẫu (3 Shop đã duyệt + 1 Shop đang chờ Manager duyệt)
INSERT INTO dbo.Shops (OwnerID, ShopName, Description, LogoUrl, PickupAddress, Phone, ShopType, ApprovalStatus, ReviewedBy, ReviewedAt, WalletBalance)
VALUES
(1, N'VitaBook Mall Chính Hãng', N'Gian hàng chính hãng của sàn VitaBook - Cam kết 100% sách bản quyền, gói quà Tết miễn phí.', 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=200&q=80', N'Quận 1, TP.HCM', '0901234567', N'Official', N'Approved', 1, SYSDATETIME(), 1250000),
(4, N'Hiệu Sách Xuân An - Phố Sách Hà Nội', N'Chuyên văn học kinh điển, sách kỹ năng và ấn phẩm Tết tuyển chọn từ Phố Sách Đinh Lễ.', 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=200&q=80', N'45 Đinh Lễ, Hoàn Kiếm, Hà Nội', '0912345678', N'Bookstore', N'Approved', 2, SYSDATETIME(), 680000),
(5, N'Tiệm Sách Cũ & Sách Hiếm Sài Gòn', N'Nơi giao lưu sách cũ chất lượng cao, sách bản in đầu và sách kỹ thuật tuyển chọn giá tốt.', 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=200&q=80', N'210 Trần Nhân Tôn, Quận 10, TP.HCM', '0938112233', N'Individual', N'Approved', 2, SYSDATETIME(), 420000),
(6, N'Góc Sách Xuân Miền Trung', N'Chuyên sách thiếu nhi, sách tô màu và quà tặng đọc sách ngày Tết cho bé.', 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=200&q=80', N'15 Pasteur, Hải Châu, Đà Nẵng', '0977554433', N'Individual', N'Pending', NULL, NULL, 0);
GO

-- 15.4. Danh mục sách (7 danh mục)
INSERT INTO dbo.Categories (CategoryName, ParentID)
VALUES
(N'Văn Học Trong Nước', NULL),
(N'Văn Học Nước Ngoài', NULL),
(N'Kinh Tế & Quản Trị', NULL),
(N'Kỹ Năng Sống & Tâm Lý', NULL),
(N'Công Nghệ Thông Tin', NULL),
(N'Thiếu Nhi & Truyện Tranh', NULL),
(N'Văn Hóa & Phong Tục Tết', NULL);
GO

-- 15.5. Tác giả & NXB
INSERT INTO dbo.Authors (AuthorName, Bio)
VALUES
(N'Nguyễn Nhật Ánh', N'Nhà văn nổi tiếng với các tác phẩm giàu cảm xúc về tuổi thơ và tuổi học trò Việt Nam.'),
(N'Paulo Coelho', N'Tiểu thuyết gia người Brazil, tác giả kiệt tác Nhà Giả Kim.'),
(N'Dale Carnegie', N'Diễn giả và tác giả cuốn Đắc Nhân Tâm nổi tiếng toàn cầu.'),
(N'Robert C. Martin (Uncle Bob)', N'Kỹ sư phần mềm huyền thoại, tác giả Clean Code và Clean Architecture.'),
(N'Yuval Noah Harari', N'Nhà sử học Israel, tác giả bộ sách Sapiens và Homo Deus.'),
(N'Haruki Murakami', N'Tiểu thuyết gia đương đại nổi tiếng của Nhật Bản.'),
(N'Toan Ánh', N'Nhà nghiên cứu văn hóa dân gian Việt Nam nổi tiếng với bộ Nếp Cũ.');
GO

INSERT INTO dbo.Publishers (PublisherName)
VALUES
(N'NXB Trẻ'),
(N'NXB Nhã Nam'),
(N'NXB Kim Đồng'),
(N'NXB Tổng Hợp TP.HCM'),
(N'NXB Văn Học');
GO

-- 15.6. Sách mẫu (10 cuốn đã duyệt ở nhiều Shop + 2 cuốn đang CHỜ MANAGER DUYỆT)
INSERT INTO dbo.Books (
    ShopID, SellerID, Title, ISBN, Price, DiscountPrice, Stock, SoldCount,
    Description, CoverImage, GalleryImages, PreviewImages, PageCount, PublicationYear,
    Format, BookCondition, PublisherID, ApprovalStatus, ReviewedBy, ReviewedAt,
    IsFlashSale, FlashSalePrice, FlashSaleEnd
)
VALUES
(
    1, 1, N'Mắt Biếc (Ấn Bản Đặc Biệt Mùa Xuân)', '9786041145671', 120000, 89000, 45, 138,
    N'Tác phẩm kinh điển của Nguyễn Nhật Ánh kèm bookmark hoa mai vàng mừng Xuân. Câu chuyện sâu lắng về mối tình đơn phương của Ngạn dành cho Hà Lan.',
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80',
    N'["https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80","https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80"]',
    N'["https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80","https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80"]',
    300, 2024, N'Bìa cứng', N'Mới 100%', 1, N'Approved', 2, SYSDATETIME(),
    1, 75000, DATEADD(DAY, 7, SYSDATETIME())
),
(
    2, 4, N'Tôi Thấy Hoa Vàng Trên Cỏ Xanh', '9786041123456', 125000, 99000, 60, 92,
    N'Những trang viết trong trẻo về tuổi thơ miền quê Việt Nam thanh bình, tặng kèm phong bao lì xì thư pháp từ Hiệu Sách Xuân An.',
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80',
    N'["https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80"]',
    N'["https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80"]',
    378, 2023, N'Bìa mềm', N'Mới 100%', 1, N'Approved', 2, SYSDATETIME(),
    0, NULL, NULL
),
(
    2, 4, N'Nhà Giả Kim (The Alchemist)', '9786043456789', 85000, 68000, 120, 240,
    N'Hành trình theo đuổi vận mệnh đầy cảm hứng cho khởi đầu năm mới rực rỡ và tràn đầy năng lượng.',
    'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=600&q=80',
    NULL,
    N'["https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80"]',
    228, 2022, N'Bìa mềm', N'Mới 100%', 2, N'Approved', 2, SYSDATETIME(),
    1, 59000, DATEADD(DAY, 5, SYSDATETIME())
),
(
    1, 1, N'Đắc Nhân Tâm (Bản Bìa Đỏ Lộc Xuân)', '9786045678901', 105000, 79000, 85, 310,
    N'Nghệ thuật thu phục lòng người - Món quà tri thức ý nghĩa cho dịp đầu năm mới.',
    'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=600&q=80',
    NULL, NULL, 320, 2024, N'Bìa mềm', N'Mới 100%', 4, N'Approved', 2, SYSDATETIME(),
    1, 69000, DATEADD(DAY, 7, SYSDATETIME())
),
(
    1, 1, N'Clean Code - Mã Sạch Và Con Đường Lập Trình Viên', '9780132350884', 350000, 295000, 30, 88,
    N'Cẩm nang không thể thiếu cho mọi kỹ sư phần mềm về cách viết mã sạch, dễ bảo trì và chuẩn mực.',
    'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=600&q=80',
    NULL,
    N'["https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=800&q=80"]',
    464, 2023, N'Bìa cứng', N'Mới 100%', 4, N'Approved', 2, SYSDATETIME(),
    0, NULL, NULL
),
(
    3, 5, N'Clean Architecture - Bản Sách Cũ Còn Mới 95%', '9780134494166', 380000, 225000, 8, 19,
    N'Sách cũ tuyển chọn từ Tiệm Sách Cũ Sài Gòn, giấy sạch không gạch xóa, gáy chắc chắn, đã bọc plastic cẩn thận.',
    'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=600&q=80',
    NULL, NULL, 432, 2022, N'Bìa cứng', N'Cũ như mới (95%)', 4, N'Approved', 2, SYSDATETIME(),
    1, 199000, DATEADD(DAY, 4, SYSDATETIME())
),
(
    2, 4, N'Sapiens: Lược Sử Loài Người', '9786048901234', 255000, 204000, 50, 145,
    N'Hành trình kinh ngạc qua toàn bộ lịch sử tiến hóa và văn minh nhân loại.',
    'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=600&q=80',
    NULL, NULL, 560, 2023, N'Bìa mềm', N'Mới 100%', 2, N'Approved', 2, SYSDATETIME(),
    0, NULL, NULL
),
(
    3, 5, N'Rừng Na Uy (Bản In Cũ Hiếm 2018)', '9786049012345', 150000, 98000, 5, 27,
    N'Ấn bản in năm 2018 còn rất đẹp, dành cho người sưu tầm văn học Haruki Murakami.',
    'https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&w=600&q=80',
    NULL, NULL, 540, 2018, N'Bìa mềm', N'Bản hiếm / Giới hạn', 2, N'Approved', 2, SYSDATETIME(),
    0, NULL, NULL
),
(
    2, 4, N'Nếp Cũ - Hội Hè Đình Đám & Phong Tục Tết Việt', '9786049988776', 180000, 145000, 40, 74,
    N'Tác phẩm đặc sắc của học giả Toan Ánh tái hiện trọn vẹn nét đẹp Tết cổ truyền, phong tục lễ nghi và văn hóa làng xã Việt Nam.',
    'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=600&q=80',
    NULL,
    N'["https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80"]',
    410, 2024, N'Bìa cứng', N'Mới 100%', 5, N'Approved', 2, SYSDATETIME(),
    1, 129000, DATEADD(DAY, 10, SYSDATETIME())
),
(
    1, 1, N'Cho Tôi Xin Một Vé Đi Tuổi Thơ', '9786041198765', 95000, 76000, 70, 112,
    N'Món quà Tết tuyệt vời cho cả gia đình cùng quay về ký ức tuổi thơ rộn ràng tiếng cười.',
    'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80',
    NULL, NULL, 220, 2024, N'Bìa mềm', N'Mới 100%', 3, N'Approved', 2, SYSDATETIME(),
    0, NULL, NULL
),
-- 2 CUỐN SÁCH ĐANG CHỜ MANAGER DUYỆT (Để kiểm thử ngay luồng Manager duyệt bài!)
(
    3, 5, N'Mắt Biếc (Sách Cũ 85% - Giá Tiết Kiệm)', '9786041145671', 110000, 55000, 3, 0,
    N'Sách cũ đã đọc 1 lần, bìa hơi sờn nhẹ ở góc nhưng trang trong sạch đẹp. Gửi Manager kiểm duyệt giúp shop ạ!',
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80',
    NULL, NULL, 300, 2020, N'Bìa mềm', N'Cũ tốt (85%)', 1, N'Pending', NULL, NULL,
    0, NULL, NULL
),
(
    2, 4, N'Homo Deus: Lược Sử Tương Lai (Bản Đặc Biệt 2027)', '9786048905678', 265000, 215000, 25, 0,
    N'Ấn bản mới in bìa ép kim vàng, tặng kèm lì xì năm mới. Kính nhờ Quản lý duyệt bài lên kệ.',
    'https://images.unsplash.com/photo-1476275466078-4007374efbbe?auto=format&fit=crop&w=600&q=80',
    NULL, NULL, 512, 2025, N'Bìa cứng', N'Mới 100%', 2, N'Pending', NULL, NULL,
    0, NULL, NULL
);
GO

INSERT INTO dbo.BookAuthors (BookID, AuthorID)
VALUES
(1, 1), (2, 1), (3, 2), (4, 3), (5, 4), (6, 4),
(7, 5), (8, 6), (9, 7), (10, 1), (11, 1), (12, 5);
GO

INSERT INTO dbo.BookCategories (BookID, CategoryID)
VALUES
(1, 1), (1, 7), (2, 1), (2, 6), (3, 2), (3, 4),
(4, 4), (4, 3), (5, 5), (6, 5), (7, 3), (8, 2),
(9, 7), (9, 1), (10, 1), (10, 6), (11, 1), (12, 3);
GO

-- 15.7. Voucher mẫu (Voucher Sàn, Freeship Tết, Voucher Shop)
INSERT INTO dbo.Vouchers (Code, Title, Scope, ShopID, DiscountType, DiscountValue, MaxDiscount, MinOrderValue, UsageLimit, UsedCount, EndDate, CreatedBy)
VALUES
('TET2027', N'Lì Xì Khai Xuân Đinh Mùi 2027 - Giảm 15% toàn sàn', N'Platform', NULL, N'Percent', 15, 50000, 100000, 500, 12, DATEADD(DAY, 60, SYSDATETIME()), 2),
('FREESHIPTET', N'Miễn phí vận chuyển Tết (tối đa 30k)', N'Freeship', NULL, N'Fixed', 30000, 30000, 80000, 500, 8, DATEADD(DAY, 60, SYSDATETIME()), 2),
('XUANAN20K', N'Giảm 20.000đ tại Hiệu Sách Xuân An', N'Shop', 2, N'Fixed', 20000, 20000, 120000, 100, 3, DATEADD(DAY, 45, SYSDATETIME()), 4),
('SACHCU10', N'Giảm 10% tại Tiệm Sách Cũ Sài Gòn', N'Shop', 3, N'Percent', 10, 30000, 90000, 100, 2, DATEADD(DAY, 45, SYSDATETIME()), 5);
GO

-- 15.8. Đơn hàng mẫu kèm Hành trình vận chuyển (OrderTrackingEvents)
INSERT INTO dbo.Orders (
    OrderGroupCode, UserID, ShopID, Subtotal, ShippingFee, ShippingMethod,
    ShopDiscount, PlatformDiscount, TotalAmount, CommissionRate, CommissionAmount, SellerNetAmount,
    IsSettled, ShippingAddress, Phone, Status, PaymentType, PaymentMethod, PaymentStatus, TrackingNumber
)
VALUES
(
    'GRP-TET-001', 3, 1, 168000, 30000, N'Standard',
    0, 0, 198000, 5.00, 8400, 159600,
    1, N'123 Nguyễn Huệ, Quận 1, TP.HCM', '0987654321', N'Completed', N'Prepaid', N'MOMO', N'Paid', 'VBX-20260001'
),
(
    'GRP-TET-002', 3, 2, 244000, 30000, N'Standard',
    20000, 0, 254000, 5.00, 11200, 212800,
    0, N'123 Nguyễn Huệ, Quận 1, TP.HCM', '0987654321', N'Shipping', N'COD', N'COD', N'Unpaid', 'VBX-20260002'
);
GO

INSERT INTO dbo.OrderDetails (OrderID, BookID, UnitPrice, Quantity)
VALUES
(1, 1, 89000, 1),
(1, 4, 79000, 1),
(2, 2, 99000, 1),
(2, 9, 145000, 1);
GO

-- Mốc hành trình vận chuyển chi tiết để khách thấy ngay trên trang Đơn hàng
INSERT INTO dbo.OrderTrackingEvents (OrderID, Stage, Title, Location, Description, UpdatedBy, CreatedAt)
VALUES
(1, N'OrderPlaced', N'Đơn hàng đã được đặt thành công', N'Hệ thống VitaBook', N'Khách hàng thanh toán trước qua Ví MoMo (Sàn tạm giữ tiền an toàn).', 3, DATEADD(DAY, -4, SYSDATETIME())),
(1, N'PickedUp', N'Đơn vị vận chuyển đã lấy hàng từ Shop', N'Kho VitaBook Quận 1, TP.HCM', N'Hàng đã được đóng gói kèm phong bao lì xì Tết.', 2, DATEADD(DAY, -3, SYSDATETIME())),
(1, N'Delivered', N'Giao hàng thành công', N'123 Nguyễn Huệ, Quận 1, TP.HCM', N'Người nhận đã ký xác nhận đầy đủ 2 cuốn sách.', 2, DATEADD(DAY, -2, SYSDATETIME())),
(1, N'Completed', N'Đơn hàng hoàn tất & đã giải ngân cho Shop', N'Hệ thống VitaBook', N'Khách hàng hài lòng, tiền đã chuyển về Ví Shop sau khi trừ 5% phí sàn.', 3, DATEADD(DAY, -1, SYSDATETIME())),

(2, N'OrderPlaced', N'Đơn hàng đã được đặt (Thanh toán COD)', N'Hệ thống VitaBook', N'Khách hàng chọn thanh toán khi nhận hàng.', 3, DATEADD(HOUR, -30, SYSDATETIME())),
(2, N'ShopConfirmed', N'Hiệu Sách Xuân An đã xác nhận & đóng gói', N'45 Đinh Lễ, Hoàn Kiếm, Hà Nội', N'Sách đang chờ tài xế sàn VitaBook Express đến lấy.', 4, DATEADD(HOUR, -24, SYSDATETIME())),
(2, N'PickedUp', N'Tài xế đã lấy hàng thành công', N'Bưu cục Hoàn Kiếm, Hà Nội', N'Quản lý vận chuyển đã quét mã vận đơn VBX-20260002.', 2, DATEADD(HOUR, -18, SYSDATETIME())),
(2, N'InTransit', N'Đơn hàng đang trung chuyển vào miền Nam', N'Trung tâm khai thác Đà Nẵng', N'Kiện hàng đã rời kho Hà Nội và đi qua trạm trung chuyển Đà Nẵng.', 2, DATEADD(HOUR, -6, SYSDATETIME()));
GO

-- 15.9. Đánh giá mẫu, Theo dõi Shop, Yêu thích sách, Thông báo & Ví
INSERT INTO dbo.Reviews (BookID, ShopID, UserID, OrderID, Rating, Comment, SellerReply, SellerRepliedAt)
VALUES
(1, 1, 3, 1, 5, N'Sách in rất đẹp, bìa cứng sang trọng, lại còn được tặng bookmark hoa mai vàng rất có không khí Tết!', N'VitaBook Mall cảm ơn bạn đã ủng hộ! Chúc bạn năm mới An Khang Thịnh Vượng!', SYSDATETIME());
GO

INSERT INTO dbo.ShopFollowers (UserID, ShopID)
VALUES (3, 1), (3, 2);
GO

INSERT INTO dbo.Wishlists (UserID, BookID)
VALUES (3, 5), (3, 9);
GO

INSERT INTO dbo.WalletTransactions (ShopID, OrderID, Type, Amount, Status, Note)
VALUES
(1, 1, N'OrderSettlement', 159600, N'Completed', N'Giải ngân đơn hàng #1 (đã trừ 5% hoa hồng sàn = 8.400đ)');
GO

INSERT INTO dbo.Notifications (UserID, Title, Message, Type, LinkUrl)
VALUES
(3, N'Đơn hàng #2 đang trên đường giao!', N'Kiện hàng VBX-20260002 vừa đi qua Trung tâm khai thác Đà Nẵng.', N'Tracking', '/orders'),
(2, N'Có 2 bài bán sách & 1 đơn mở Shop chờ duyệt', N'Vui lòng vào Bảng điều khiển Quản lý để kiểm duyệt ngay.', N'Book', '/manager');
GO

-- 15.10. Tài khoản kết nối cho Node.js Backend
USE master;
GO
IF NOT EXISTS (SELECT name FROM sys.sql_logins WHERE name = 'bookstore_user')
BEGIN
    CREATE LOGIN bookstore_user WITH PASSWORD = 'Bookstore@2026', CHECK_POLICY = OFF;
END
GO
USE BookstoreDB;
GO
IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'bookstore_user')
BEGIN
    CREATE USER bookstore_user FOR LOGIN bookstore_user;
END
ALTER ROLE db_owner ADD MEMBER bookstore_user;
GO
