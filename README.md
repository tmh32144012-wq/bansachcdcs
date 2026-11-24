# 🏮 VitaBook Xuân — Sàn Thương Mại Điện Tử Chuyên Sách (Multi-Vendor Book Marketplace)

Hệ thống **Sàn TMĐT Đa Gian Hàng chuyên ngành Sách** (mô hình Shopee/Lazada cho sách) mang giao diện & hiệu ứng **Tết Cổ Truyền Việt Nam**, được xây dựng bằng **Node.js (Express)**, **React.js (Vite + Tailwind CSS)** và **Microsoft SQL Server (`mssql`)**, tối ưu cấu trúc tách file riêng biệt từng trang để dễ kiểm tra trong **Visual Studio Code**.

---

## 🎯 Các Tác Nhân & Chức Năng Đầy Đủ

1. **Khách hàng (`Customer`)**:
   * Tìm kiếm & lọc nâng cao (Tên sách, Tác giả, ISBN, tên Shop, Danh mục, Tình trạng sách mới/cũ, Khoảng giá, Flash Sale).
   * Xem chi tiết sách với **nhiều ảnh** & **Đọc thử các trang mẫu**.
   * **Theo dõi Gian hàng (Follow Shop)** & **Sách yêu thích (Wishlist)**.
   * **Chat trực tiếp thời gian thực** (Người mua ↔ Shop) và **Chuông thông báo realtime (SSE)**.
   * **Giỏ hàng đa Shop & Tách đơn tự động theo từng Shop**, áp dụng **Voucher 2 tầng** (Voucher Shop + Voucher Sàn / Freeship).
   * **Thanh toán 2 chế độ:** Nhận hàng rồi mới thanh toán (**COD**) hoặc **Thanh toán trước** (VietQR, MoMo, ZaloPay, Agribank — Sàn giữ tiền hộ **Escrow**).
   * Xem **Hành trình vận chuyển chi tiết theo từng mốc** do Quản lý cập nhật, xác nhận **"Đã nhận hàng"**, gửi **Khiếu nại / Trả hàng hoàn tiền**, **Viết đánh giá 1–5 sao** và **Xuất Hóa đơn PDF**.

2. **Người bán / Chủ Gian hàng (`Seller` — Khách hàng mở Shop)**:
   * Gửi hồ sơ **Đăng ký mở Gian hàng** chờ `Manager` duyệt.
   * Đăng bài bán sách mới (tải trực tiếp nhiều ảnh sách & ảnh đọc thử lên `server/uploads`), chọn tình trạng sách (*Mới 100%, Cũ 95%, Cũ 85%, Bản hiếm*), theo dõi trạng thái duyệt & lý do từ chối.
   * Quản lý đơn hàng của Shop (Xác nhận / Đóng gói), tạo **Voucher riêng của Shop**, phản hồi đánh giá khách hàng.
   * **Ví doanh thu Shop & Đối soát hoa hồng:** Xem số dư khả dụng, tiền Escrow đang tạm giữ và gửi yêu cầu rút tiền.

3. **Quản lý vận hành sàn (`Manager` — Tác nhân thứ 3)**:
   * **Duyệt bài đăng bán sách:** Mở đọc toàn bộ chi tiết bài đăng → **Duyệt lên kệ / Từ chối kèm lý do / Gỡ vi phạm** (tự động báo cho người bán và khách theo dõi Shop).
   * **Duyệt hồ sơ đăng ký mở Shop** (Duyệt / Từ chối / Tạm khóa).
   * **Cập nhật hành trình vận chuyển chi tiết (`OrderTrackingEvents`):** Ghi chặng vận chuyển (*Đã lấy hàng → Trung chuyển → Kho phân loại → Đang giao → Giao thành công*) kèm **Vị trí hiện tại + Ghi chú** để khách hàng theo dõi trực tiếp.
   * **Trọng tài phân xử Khiếu nại / Trả hàng hoàn tiền**.
   * Kiểm duyệt đánh giá vi phạm, phát hành **Voucher Sàn / Freeship** và bật/tắt **Flash Sale Tết**.

4. **Quản trị cấp cao (`Admin`)**:
   * Báo cáo tài chính toàn sàn (GMV, Hoa hồng sàn thu được, Top Shop) & **Xuất báo cáo Excel (`.xlsx`)**.
   * Quản lý người dùng, **tạo tài khoản `Manager`**, phân quyền & khóa/mở tài khoản.
   * Duyệt hoặc từ chối **yêu cầu rút tiền từ Ví Shop**.
   * Cấu hình **`% phí hoa hồng sàn`** & **phí vận chuyển**.
   * Quản lý Danh mục, Tác giả, NXB gốc & xem **Nhật ký kiểm duyệt (`AuditLogs`)**.

---

## 📂 Cấu Trúc Thư Mục Tách File Riêng Biệt (Chuẩn VS Code)

```text
d:\websitebansach\
├── schema.sql                             # Script SQL Server đầy đủ 20 bảng + dữ liệu mẫu Tết
├── server/                                # Backend Node.js + Express + MSSQL
│   ├── server.js                          # Entry point & đăng ký toàn bộ RESTful API
│   ├── config/db.js                       # Connection Pool tới SQL Server
│   ├── utils/helpers.js                   # SSE Realtime (Chat/Thông báo), AuditLog, Settings
│   ├── middleware/                        # authMiddleware.js, roleMiddleware.js, errorHandler.js
│   ├── controllers/                       # Tách riêng từng nghiệp vụ (auth, book, shop, order, manager, admin, voucher, review, dispute, social, chat, upload...)
│   ├── routes/                            # Tách riêng từng cụm API routes
│   └── uploads/                           # Thư mục lưu ảnh sách & ảnh đọc thử tải từ máy
└── client/                                # Frontend React.js + Vite + Tailwind CSS
    └── src/
        ├── effects/                       # HIỆU ỨNG TẾT TÁCH RIÊNG TỪNG FILE (.jsx + .css)
        │   ├── TetBlossomsEffect.jsx/css  # Hoa mai vàng & hoa đào hồng rơi
        │   ├── TetLanternsEffect.jsx/css  # Đôi đèn lồng đỏ Phúc - Lộc đung đưa
        │   ├── TetFireworksEffect.jsx/css # Pháo hoa đêm Giao thừa (Canvas)
        │   ├── TetRedEnvelopeEffect.jsx/css # Bao lì xì may mắn
        │   ├── TetGoldCoinEffect.jsx/css  # Đồng xu vàng tài lộc
        │   └── TetScrollBorderEffect.jsx/css # Câu đối đỏ Tết cổ truyền
        ├── components/                    # Navbar/, Footer/, BookCard/ (mỗi component có .jsx + .css riêng)
        ├── context/                       # AuthContext, CartContext, RealtimeContext (SSE)
        ├── services/api.js                # Toàn bộ API services & upload ảnh
        └── pages/                         # MỖI TRANG 1 THƯ MỤC RIÊNG (.jsx + .css RIÊNG)
            ├── HomePage/                  # Trang chủ Tết
            ├── ShopPage/                  # Chợ sách & Bộ lọc nâng cao
            ├── BookDetailPage/            # Chi tiết sách, Đọc thử, Theo dõi & Đánh giá
            ├── VendorShopPage/            # Trang Gian hàng riêng của từng Shop
            ├── CartCheckoutPage/          # Giỏ hàng đa Shop, COD & Thanh toán trước
            ├── OrdersHistoryPage/         # Lịch sử đơn, Timeline vận chuyển, PDF, Khiếu nại
            ├── FavoritesPage/             # Shop đang theo dõi & Sách yêu thích
            ├── ChatPage/                  # Chat trực tiếp Người mua ↔ Shop
            ├── SellerCenterPage/          # Kênh Người Bán & Ví Doanh Thu
            ├── ManagerDashboardPage/      # Bảng Quản Lý (Duyệt bài, Duyệt Shop, Ghi vận chuyển)
            ├── AdminDashboardPage/        # Bảng Quản Trị Cấp Cao & Xuất Excel
            ├── LoginPage/                 # Đăng nhập + Pháo hoa Tết + CAPTCHA server + Quên mật khẩu OTP
            └── RegisterPage/              # Đăng ký thành viên + CAPTCHA server
```

---

## 🔒 Tính Năng Bảo Mật & Kiểm Thử

- **CAPTCHA xác thực phía Server (dùng 1 lần):** Mã xác nhận Tết được ký và kiểm tra chống replay trực tiếp tại `/api/auth/captcha`, `/api/auth/login` và `/api/auth/register`.
- **Thu hồi phiên tức thời (`TokenVersion` & `IsActive`):** Đổi mật khẩu, Đặt lại mật khẩu OTP, Đăng xuất mọi thiết bị hoặc khi Admin khóa/đổi quyền sẽ lập tức vô hiệu hóa các JWT cũ.
- **Rate Limiting & Security Headers:** Giới hạn tần suất đăng nhập, đăng ký, quên mật khẩu, tải ảnh và toàn bộ API; gắn đầy đủ HTTP security headers & CORS whitelist.
- **Kiểm tra Magic Bytes ảnh tải lên:** Chặn tệp giả mạo định dạng ảnh trước khi lưu vào `server/uploads`.
- **SSE Ticket dùng 1 lần:** Kết nối thông báo/chat realtime dùng vé ngắn hạn 60 giây thay vì truyền JWT dài hạn trên URL.
- **Chạy Unit Test Backend:**
  ```bash
  cd d:\websitebansach\server
  npm test
  ```

---

## ⚙️ Hướng Dẫn Chạy Dự Án Trong Visual Studio Code

### Bước 1: Chạy `schema.sql` trên SQL Server (SSMS)
1. Mở **SQL Server Management Studio (SSMS)**, mở file [`schema.sql`](./schema.sql) và nhấn **Execute (F5)**.
2. Script sẽ khởi tạo đầy đủ database `BookstoreDB` với **20 bảng quan hệ** cùng dữ liệu mẫu Tết:
   * **Admin:** `admin@bookstore.vn` / `123456`
   * **Quản lý (`Manager`):** `manager@bookstore.vn` / `123456`
   * **Chủ Shop (đã duyệt):** `shopxuanan@bookstore.vn` / `123456` (và `shopsachcu@bookstore.vn`)
   * **Khách hàng mua sách:** `khachhang@bookstore.vn` / `123456`
   * **Khách đang chờ duyệt mở Shop:** `dangkyshop@bookstore.vn` / `123456`

### Bước 2: Chạy Backend (`/server`)
```bash
cd d:\websitebansach\server
npm run dev
```

### Bước 3: Chạy Frontend (`/client`)
```bash
cd d:\websitebansach\client
npm run dev
```
Truy cập trình duyệt tại: `http://localhost:5173`
