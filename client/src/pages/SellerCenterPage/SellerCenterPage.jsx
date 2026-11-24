import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Store,
  Plus,
  BookOpen,
  Package,
  Tag,
  Wallet,
  Upload,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import {
  sellerService,
  catalogService,
  voucherService,
  uploadFilesToServer,
  formatVND,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './SellerCenterPage.css';

const EMPTY_BOOK = {
  title: '',
  isbn: '',
  price: '',
  discountPrice: '',
  stock: 10,
  description: '',
  coverImage: '',
  galleryImages: [],
  previewImages: [],
  pageCount: '',
  publicationYear: 2025,
  format: 'Bìa mềm',
  bookCondition: 'Mới 100%',
  publisherId: '',
  authorIds: [],
  categoryIds: [],
};

const SellerCenterPage = () => {
  const { user, refreshUser } = useAuth();
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('books');
  const [notice, setNotice] = useState('');

  // Form đăng ký mở Shop
  const [regForm, setRegForm] = useState({
    shopName: '',
    description: '',
    pickupAddress: user?.address || '',
    phone: user?.phone || '',
    shopType: 'Individual',
    logoUrl: '',
  });

  // Dữ liệu Seller Center
  const [books, setBooks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [shopVouchers, setShopVouchers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [publishers, setPublishers] = useState([]);

  // Form đăng/sửa sách
  const [showBookForm, setShowBookForm] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  const [bookForm, setBookForm] = useState(EMPTY_BOOK);
  const [uploading, setUploading] = useState(false);

  // Form Voucher Shop & Rút tiền
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    title: '',
    discountType: 'Fixed',
    discountValue: 15000,
    maxDiscount: '',
    minOrderValue: 100000,
    usageLimit: 50,
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', bankInfo: '' });

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [shopRes, catRes, authRes, pubRes] = await Promise.all([
        sellerService.getMyShop(),
        catalogService.getCategories(),
        catalogService.getAuthors(),
        catalogService.getPublishers(),
      ]);
      const myShop = shopRes.data?.data || null;
      setShop(myShop);
      setCategories(catRes.data?.data || []);
      setAuthors(authRes.data?.data || []);
      setPublishers(pubRes.data?.data || []);

      if (myShop) {
        setRegForm({
          shopName: myShop.ShopName || '',
          description: myShop.Description || '',
          pickupAddress: myShop.PickupAddress || '',
          phone: myShop.Phone || '',
          shopType: myShop.ShopType || 'Individual',
          logoUrl: myShop.LogoUrl || '',
        });
      }

      if (myShop && myShop.ApprovalStatus === 'Approved') {
        const [bRes, oRes, wRes, vRes] = await Promise.all([
          sellerService.getMyBooks(),
          sellerService.getSellerOrders(),
          sellerService.getWallet(),
          voucherService.getVouchers({ shopId: myShop.ShopID, includeAll: 1 }),
        ]);
        setBooks(bRes.data?.data || []);
        setOrders(oRes.data?.data || []);
        setWallet(wRes.data?.data || null);
        setShopVouchers(vRes.data?.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleRegisterShop = async (e) => {
    e.preventDefault();
    try {
      const res = await sellerService.registerShop(regForm);
      showNotice(res.data?.message || 'Đã gửi hồ sơ mở Gian hàng!');
      await refreshUser();
      loadAll();
    } catch (err) {
      showNotice(err.response?.data?.message || 'Không thể gửi đăng ký Shop.');
    }
  };

  const handleUploadImages = async (files, targetField) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadFilesToServer(files);
      if (targetField === 'logo') {
        setRegForm((f) => ({ ...f, logoUrl: urls[0] || f.logoUrl }));
      } else if (targetField === 'gallery') {
        setBookForm((f) => ({
          ...f,
          coverImage: f.coverImage || urls[0] || '',
          galleryImages: [...f.galleryImages, ...urls],
        }));
      } else if (targetField === 'preview') {
        setBookForm((f) => ({
          ...f,
          previewImages: [...f.previewImages, ...urls],
        }));
      }
      showNotice(`Đã tải lên ${urls.length} ảnh thành công!`);
    } catch (err) {
      showNotice(err.response?.data?.message || 'Lỗi tải ảnh lên máy chủ.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveBook = async (e) => {
    e.preventDefault();
    try {
      if (editingBookId) {
        const res = await sellerService.updateBook(editingBookId, bookForm);
        showNotice(res.data?.message || 'Đã cập nhật sách!');
      } else {
        const res = await sellerService.createBook(bookForm);
        showNotice(res.data?.message || 'Đã gửi bài bán sách chờ Quản lý duyệt!');
      }
      setShowBookForm(false);
      setEditingBookId(null);
      setBookForm(EMPTY_BOOK);
      loadAll();
    } catch (err) {
      showNotice(err.response?.data?.message || 'Không thể lưu sách.');
    }
  };

  const openEditBook = (b) => {
    setEditingBookId(b.BookID);
    setBookForm({
      title: b.Title || '',
      isbn: b.ISBN || '',
      price: b.Price || '',
      discountPrice: b.DiscountPrice || '',
      stock: b.Stock || 0,
      description: b.Description || '',
      coverImage: b.CoverImage || '',
      galleryImages: b.galleryImages || [],
      previewImages: b.previewImages || [],
      pageCount: b.PageCount || '',
      publicationYear: b.PublicationYear || 2025,
      format: b.Format || 'Bìa mềm',
      bookCondition: b.BookCondition || 'Mới 100%',
      publisherId: b.PublisherID || '',
      authorIds: b.authorIds || [],
      categoryIds: b.categoryIds || [],
    });
    setShowBookForm(true);
  };

  const handleSellerOrderAction = async (orderId, status) => {
    try {
      const res = await sellerService.updateSellerOrderStatus(orderId, { status });
      showNotice(res.data?.message || 'Đã cập nhật đơn.');
      loadAll();
    } catch (err) {
      showNotice(err.response?.data?.message || 'Lỗi cập nhật trạng thái đơn.');
    }
  };

  const handleCreateVoucher = async (e) => {
    e.preventDefault();
    try {
      const res = await voucherService.createVoucher({ ...voucherForm, scope: 'Shop' });
      showNotice(res.data?.message || 'Đã tạo mã khuyến mãi Shop!');
      setVoucherForm({ ...voucherForm, code: '', title: '' });
      loadAll();
    } catch (err) {
      showNotice(err.response?.data?.message || 'Không thể tạo Voucher.');
    }
  };

  const handleRequestWithdraw = async (e) => {
    e.preventDefault();
    try {
      const res = await sellerService.requestWithdrawal(withdrawForm);
      showNotice(res.data?.message || 'Đã gửi yêu cầu rút tiền!');
      setWithdrawForm({ amount: '', bankInfo: '' });
      loadAll();
    } catch (err) {
      showNotice(err.response?.data?.message || 'Không thể gửi yêu cầu rút tiền.');
    }
  };

  if (loading) return <div className="py-20 text-center text-stone-500">Đang tải Kênh Người Bán...</div>;

  // TRƯỜNG HỢP 1: CHƯA CÓ SHOP HOẶC BỊ TỪ CHỐI -> FORM ĐĂNG KÝ MỞ SHOP
  if (!shop || shop.ApprovalStatus === 'Rejected') {
    return (
      <div className="seller-tet-page max-w-3xl mx-auto px-4 py-10 relative">
        <div className="seller-card relative z-10 space-y-5">
          <div className="text-center">
            <span className="inline-flex p-3 rounded-2xl bg-red-100 text-[#b91c1c] mb-2">
              <Store className="w-8 h-8" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#7f1d1d]">🏮 Đăng Ký Mở Gian Hàng Sách</h1>
            <p className="text-sm text-stone-600 mt-1">
              Điền thông tin Gian hàng của bạn để gửi <strong>Quản lý sàn (Manager)</strong> xét duyệt trước khi đăng bán sách.
            </p>
          </div>

          {shop?.ApprovalStatus === 'Rejected' && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-sm text-red-800">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Hồ sơ trước đó bị từ chối:
              </p>
              <p className="mt-1">{shop.RejectionReason}</p>
              <p className="text-xs mt-1 text-stone-600">Bạn có thể chỉnh sửa lại thông tin bên dưới và gửi duyệt lại.</p>
            </div>
          )}

          {notice && <div className="p-3 rounded-xl bg-amber-100 border border-amber-400 text-sm font-bold text-[#7f1d1d]">{notice}</div>}

          <form onSubmit={handleRegisterShop} className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1">Tên Gian hàng / Hiệu sách *</label>
              <input
                type="text"
                required
                value={regForm.shopName}
                onChange={(e) => setRegForm((f) => ({ ...f, shopName: e.target.value }))}
                placeholder="VD: Tiệm Sách Cũ Mùa Xuân"
                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold block mb-1">Loại hình Gian hàng</label>
                <select
                  value={regForm.shopType}
                  onChange={(e) => setRegForm((f) => ({ ...f, shopType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-amber-300 text-sm bg-white"
                >
                  <option value="Individual">Cá nhân bán sách mới / sách cũ</option>
                  <option value="Bookstore">Hiệu sách / Công ty phát hành</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold block mb-1">Số điện thoại liên hệ *</label>
                <input
                  type="text"
                  required
                  value={regForm.phone}
                  onChange={(e) => setRegForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold block mb-1">Địa chỉ kho lấy hàng *</label>
              <input
                type="text"
                required
                value={regForm.pickupAddress}
                onChange={(e) => setRegForm((f) => ({ ...f, pickupAddress: e.target.value }))}
                placeholder="Số nhà, quận/huyện, tỉnh/thành..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold block mb-1">Giới thiệu về Gian hàng</label>
              <textarea
                rows={3}
                value={regForm.description}
                onChange={(e) => setRegForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả dòng sách bạn chuyên bán, cam kết chất lượng..."
                className="w-full p-3 rounded-xl border border-amber-300 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold block mb-1">Ảnh Logo Gian hàng (Tải từ máy)</label>
              <input type="file" accept="image/*" onChange={(e) => handleUploadImages(e.target.files, 'logo')} className="text-xs" />
              {regForm.logoUrl && <img src={regForm.logoUrl} alt="logo" className="w-16 h-16 rounded-xl object-cover mt-2 border border-amber-400" />}
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-amber-100 font-extrabold text-sm border border-amber-400"
            >
              Gửi Hồ Sơ Mở Gian Hàng Chờ Quản Lý Duyệt
            </button>
          </form>
        </div>
      </div>
    );
  }

  // TRƯỜNG HỢP 2: SHOP ĐANG CHỜ DUYỆT HOẶC BỊ TẠM KHÓA
  if (shop.ApprovalStatus !== 'Approved') {
    return (
      <div className="seller-tet-page max-w-2xl mx-auto px-4 py-14 relative">
        <div className="seller-card text-center space-y-3 relative z-10">
          <Clock className="w-14 h-14 text-amber-600 mx-auto" />
          <h1 className="text-2xl font-extrabold text-[#7f1d1d]">
            Gian hàng "{shop.ShopName}" — {shop.ApprovalStatus === 'Pending' ? 'Đang Chờ Quản Lý Duyệt' : 'Đang Bị Tạm Khóa'}
          </h1>
          <p className="text-sm text-stone-600">
            {shop.ApprovalStatus === 'Pending'
              ? 'Hồ sơ của bạn đã được chuyển đến bộ phận Quản lý sàn (Manager). Bạn sẽ nhận được thông báo ngay khi được phê duyệt!'
              : `Lý do khóa: ${shop.RejectionReason || 'Vi phạm chính sách sàn.'}`}
          </p>
        </div>
      </div>
    );
  }

  // TRƯỜNG HỢP 3: SHOP ĐÃ ĐƯỢC DUYỆT -> FULL KÊNH NGƯỜI BÁN
  return (
    <div className="seller-tet-page max-w-7xl mx-auto px-4 py-8 relative">

      {/* Header Kênh Người Bán */}
      <div className="seller-header mb-6 relative z-10">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-300 font-bold">Kênh Người Bán VitaBook</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#fef3c7] flex items-center gap-2 mt-0.5">
            🏪 {shop.ShopName}
          </h1>
          <p className="text-xs text-amber-200 mt-1">
            📚 {shop.ApprovedBooks} sách đang bán • ⏳ {shop.PendingBooks} chờ duyệt • ❤️ {shop.FollowerCount} người theo dõi • 💰 Ví: <strong>{formatVND(shop.WalletBalance)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/shops/${shop.ShopID}`} className="px-4 py-2 rounded-xl bg-amber-400 text-[#450a0a] font-extrabold text-xs inline-flex items-center gap-1.5">
            <ExternalLink className="w-4 h-4" /> Xem Trang Shop
          </Link>
        </div>
      </div>

      {notice && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-100 border border-amber-500 text-[#7f1d1d] font-bold text-sm relative z-10">
          🧧 {notice}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 relative z-10">
        {[
          { id: 'books', label: `Quản lý Sách (${books.length})`, icon: BookOpen },
          { id: 'orders', label: `Đơn hàng Shop (${orders.length})`, icon: Package },
          { id: 'vouchers', label: `Voucher Shop (${shopVouchers.length})`, icon: Tag },
          { id: 'wallet', label: `Ví Doanh Thu (${formatVND(shop.WalletBalance)})`, icon: Wallet },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`seller-tab-btn ${activeTab === t.id ? 'is-active' : ''}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: QUẢN LÝ SÁCH & ĐĂNG BÀI BÁN SÁCH */}
      {activeTab === 'books' && (
        <div className="space-y-5 relative z-10">
          <div className="flex justify-between items-center">
            <p className="text-sm text-stone-600">
              Mọi bài đăng sách mới hoặc chỉnh sửa nội dung sẽ chuyển sang <strong>Chờ duyệt (Pending)</strong> để Quản lý kiểm tra trước khi hiển thị lên sàn.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingBookId(null);
                setBookForm(EMPTY_BOOK);
                setShowBookForm((p) => !p);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-xs inline-flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" /> {showBookForm ? 'Đóng form' : 'Đăng bán sách mới'}
            </button>
          </div>

          {showBookForm && (
            <form onSubmit={handleSaveBook} className="seller-card space-y-4">
              <h2 className="text-lg font-bold text-[#7f1d1d]">
                {editingBookId ? `✏️ Chỉnh sửa sách #${editingBookId}` : '📝 Đăng bài bán sách mới (Gửi Quản lý duyệt)'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold block mb-1">Tên cuốn sách *</label>
                  <input type="text" required value={bookForm.title} onChange={(e) => setBookForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Mã ISBN *</label>
                  <input type="text" required value={bookForm.isbn} onChange={(e) => setBookForm((f) => ({ ...f, isbn: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs font-bold block mb-1">Giá bìa (VNĐ) *</label>
                  <input type="number" required value={bookForm.price} onChange={(e) => setBookForm((f) => ({ ...f, price: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Giá bán ưu đãi</label>
                  <input type="number" value={bookForm.discountPrice} onChange={(e) => setBookForm((f) => ({ ...f, discountPrice: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Tồn kho *</label>
                  <input type="number" required value={bookForm.stock} onChange={(e) => setBookForm((f) => ({ ...f, stock: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Tình trạng sách</label>
                  <select value={bookForm.bookCondition} onChange={(e) => setBookForm((f) => ({ ...f, bookCondition: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-amber-300 text-sm bg-white">
                    <option>Mới 100%</option>
                    <option>Cũ như mới (95%)</option>
                    <option>Cũ tốt (85%)</option>
                    <option>Bản hiếm / Giới hạn</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Hình thức bìa</label>
                  <select value={bookForm.format} onChange={(e) => setBookForm((f) => ({ ...f, format: e.target.value }))} className="w-full px-2.5 py-2 rounded-xl border border-amber-300 text-sm bg-white">
                    <option>Bìa mềm</option>
                    <option>Bìa cứng</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold block mb-1">Nhà xuất bản</label>
                  <select value={bookForm.publisherId} onChange={(e) => setBookForm((f) => ({ ...f, publisherId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white">
                    <option value="">-- Chọn NXB --</option>
                    {publishers.map((p) => <option key={p.PublisherID} value={p.PublisherID}>{p.PublisherName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Tác giả</label>
                  <select
                    value={bookForm.authorIds[0] || ''}
                    onChange={(e) => setBookForm((f) => ({ ...f, authorIds: e.target.value ? [Number(e.target.value)] : [] }))}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white"
                  >
                    <option value="">-- Chọn Tác giả --</option>
                    {authors.map((a) => <option key={a.AuthorID} value={a.AuthorID}>{a.AuthorName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Thể loại</label>
                  <select
                    value={bookForm.categoryIds[0] || ''}
                    onChange={(e) => setBookForm((f) => ({ ...f, categoryIds: e.target.value ? [Number(e.target.value)] : [] }))}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white"
                  >
                    <option value="">-- Chọn Thể loại --</option>
                    {categories.map((c) => <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}
                  </select>
                </div>
              </div>

              {/* Upload nhiều ảnh sách & Ảnh đọc thử */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50 p-4 rounded-xl border border-amber-200">
                <div>
                  <label className="text-xs font-bold text-[#7f1d1d] flex items-center gap-1.5 mb-1.5">
                    <Upload className="w-4 h-4" /> Tải nhiều ảnh sách (bìa trước, bìa sau, gáy sách)
                  </label>
                  <input type="file" multiple accept="image/*" onChange={(e) => handleUploadImages(e.target.files, 'gallery')} className="text-xs" />
                  <input
                    type="text"
                    value={bookForm.coverImage}
                    onChange={(e) => setBookForm((f) => ({ ...f, coverImage: e.target.value }))}
                    placeholder="Hoặc dán link URL ảnh bìa..."
                    className="w-full mt-2 px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs bg-white"
                  />
                  {bookForm.galleryImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {bookForm.galleryImages.map((u, idx) => (
                        <img key={idx} src={u} alt="g" className="w-12 h-16 rounded object-cover border border-amber-400" />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-[#7f1d1d] flex items-center gap-1.5 mb-1.5">
                    <BookOpen className="w-4 h-4" /> Tải ảnh trang đọc thử (Preview)
                  </label>
                  <input type="file" multiple accept="image/*" onChange={(e) => handleUploadImages(e.target.files, 'preview')} className="text-xs" />
                  {bookForm.previewImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {bookForm.previewImages.map((u, idx) => (
                        <img key={idx} src={u} alt="p" className="w-12 h-16 rounded object-cover border border-amber-400" />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Mô tả chi tiết sách *</label>
                <textarea
                  rows={3}
                  required
                  value={bookForm.description}
                  onChange={(e) => setBookForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Giới thiệu nội dung, tình trạng giấy thực tế, quà tặng kèm..."
                  className="w-full p-3 rounded-xl border border-amber-300 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="px-6 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm"
              >
                {uploading ? 'Đang tải ảnh...' : editingBookId ? 'Lưu cập nhật' : 'Gửi bài chờ Quản lý duyệt'}
              </button>
            </form>
          )}

          {/* Danh sách sách của Shop */}
          <div className="seller-card overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-amber-200 text-xs text-[#7f1d1d]">
                  <th className="py-2.5 px-2">Sách</th>
                  <th className="py-2.5 px-2">Giá bán</th>
                  <th className="py-2.5 px-2">Tồn / Đã bán</th>
                  <th className="py-2.5 px-2">Trạng thái duyệt</th>
                  <th className="py-2.5 px-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {books.map((b) => (
                  <tr key={b.BookID}>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2.5">
                        <img src={b.CoverImage || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=100&q=80'} alt={b.Title} className="w-10 h-14 rounded object-cover border border-amber-200" />
                        <div>
                          <p className="font-bold text-[#3b1510]">{b.Title}</p>
                          <p className="text-xs text-stone-500">{b.BookCondition} • ISBN: {b.ISBN}</p>
                          {b.RejectionReason && (
                            <p className="text-xs text-red-700 font-semibold mt-0.5">❌ Lý do từ chối: {b.RejectionReason}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2 font-bold text-[#b91c1c]">{formatVND(b.DiscountPrice || b.Price)}</td>
                    <td className="py-3 px-2 text-xs">{b.Stock} / {b.SoldCount}</td>
                    <td className="py-3 px-2">
                      <span className={`seller-status-badge status-${b.ApprovalStatus.toLowerCase()}`}>
                        {b.ApprovalStatus}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right space-x-1.5">
                      <button type="button" onClick={() => openEditBook(b)} className="px-2.5 py-1 rounded-lg bg-amber-100 text-[#7f1d1d] text-xs font-bold">
                        Sửa
                      </button>
                      {['Approved', 'Hidden'].includes(b.ApprovalStatus) && (
                        <button
                          type="button"
                          onClick={async () => {
                            await sellerService.toggleBookVisibility(b.BookID);
                            loadAll();
                          }}
                          className="px-2.5 py-1 rounded-lg border border-amber-300 text-xs font-bold inline-flex items-center gap-1"
                        >
                          {b.ApprovalStatus === 'Approved' ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {b.ApprovalStatus === 'Approved' ? 'Ẩn' : 'Hiện'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ĐƠN HÀNG CỦA SHOP */}
      {activeTab === 'orders' && (
        <div className="space-y-4 relative z-10">
          {orders.length === 0 ? (
            <div className="seller-card text-center py-10 text-stone-500">Chưa có đơn hàng nào từ khách.</div>
          ) : (
            orders.map((ord) => (
              <div key={ord.OrderID} className="seller-card space-y-3">
                <div className="flex flex-wrap justify-between gap-2 pb-2 border-b border-amber-200">
                  <div>
                    <span className="font-extrabold text-[#7f1d1d]">Đơn #{ord.OrderID}</span>
                    <span className="ml-2 text-xs text-stone-600">Khách: {ord.CustomerName} ({ord.Phone})</span>
                  </div>
                  <div className="flex gap-2 text-xs font-bold">
                    <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-[#991b1b]">{ord.Status}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                      Thực nhận sau phí sàn ({ord.CommissionRate}%): {formatVND(ord.SellerNetAmount)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-stone-600">
                  {ord.items?.map((i) => (
                    <p key={i.OrderDetailID}>• {i.Title} × {i.Quantity} ({formatVND(i.UnitPrice)})</p>
                  ))}
                  <p className="mt-1">📍 Giao tới: {ord.ShippingAddress}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-100">
                  {ord.Status === 'Pending' && (
                    <>
                      <button type="button" onClick={() => handleSellerOrderAction(ord.OrderID, 'Confirmed')} className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Xác nhận đơn
                      </button>
                      <button type="button" onClick={() => handleSellerOrderAction(ord.OrderID, 'Cancelled')} className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-300 text-red-700 text-xs font-bold">
                        Hủy đơn
                      </button>
                    </>
                  )}
                  {ord.Status === 'Confirmed' && (
                    <button type="button" onClick={() => handleSellerOrderAction(ord.OrderID, 'Packing')} className="px-3.5 py-1.5 rounded-lg bg-[#b91c1c] text-amber-100 text-xs font-bold">
                      📦 Đánh dấu Đang đóng gói (Chờ Quản lý lấy hàng)
                    </button>
                  )}
                  {['Packing', 'Shipping', 'Delivered', 'Completed'].includes(ord.Status) && (
                    <span className="text-xs text-amber-800 font-semibold">
                      🚚 Hành trình giao hàng tiếp theo đang được Quản lý vận chuyển sàn cập nhật ({ord.trackingEvents?.length || 0} mốc).
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: VOUCHER CỦA SHOP */}
      {activeTab === 'vouchers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
          <form onSubmit={handleCreateVoucher} className="lg:col-span-5 seller-card space-y-3">
            <h3 className="font-bold text-[#7f1d1d]">🧧 Tạo Mã Giảm Giá Riêng Của Shop</h3>
            <input type="text" required placeholder="Mã code (VD: SHOPXUAN20)" value={voucherForm.code} onChange={(e) => setVoucherForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm uppercase" />
            <input type="text" required placeholder="Mô tả ngắn (VD: Giảm 15k cho đơn từ 100k)" value={voucherForm.title} onChange={(e) => setVoucherForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={voucherForm.discountType} onChange={(e) => setVoucherForm((f) => ({ ...f, discountType: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white">
                <option value="Fixed">Giảm tiền (VNĐ)</option>
                <option value="Percent">Giảm %</option>
              </select>
              <input type="number" required placeholder="Giá trị giảm" value={voucherForm.discountValue} onChange={(e) => setVoucherForm((f) => ({ ...f, discountValue: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Đơn tối thiểu" value={voucherForm.minOrderValue} onChange={(e) => setVoucherForm((f) => ({ ...f, minOrderValue: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm" />
              <input type="date" required value={voucherForm.endDate} onChange={(e) => setVoucherForm((f) => ({ ...f, endDate: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">Tạo Voucher Shop</button>
          </form>

          <div className="lg:col-span-7 seller-card space-y-3">
            <h3 className="font-bold text-[#7f1d1d]">Danh sách Voucher đang có</h3>
            {shopVouchers.length === 0 ? (
              <p className="text-sm text-stone-500">Chưa có mã khuyến mãi nào.</p>
            ) : (
              shopVouchers.map((v) => (
                <div key={v.VoucherID} className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-dashed border-[#b91c1c]">
                  <div>
                    <p className="font-extrabold text-sm text-[#b91c1c]">{v.Code}</p>
                    <p className="text-xs text-stone-700">{v.Title} • Đã dùng {v.UsedCount}/{v.UsageLimit}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await voucherService.deleteVoucher(v.VoucherID);
                      loadAll();
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: VÍ DOANH THU & RÚT TIỀN */}
      {activeTab === 'wallet' && wallet && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
          <div className="lg:col-span-5 space-y-4">
            <div className="seller-card bg-gradient-to-br from-[#991b1b] to-[#7f1d1d] text-amber-100 border-amber-400">
              <p className="text-xs uppercase tracking-wider text-amber-300 font-bold">Số dư khả dụng Ví Shop</p>
              <p className="text-3xl font-extrabold text-amber-200 mt-1">{formatVND(wallet.walletBalance)}</p>
              <p className="text-xs text-amber-100/80 mt-2">
                Tiền đang tạm giữ hộ (Escrow chờ khách nhận hàng): <strong>{formatVND(wallet.escrowAmount)}</strong>
              </p>
            </div>

            <form onSubmit={handleRequestWithdraw} className="seller-card space-y-3">
              <h3 className="font-bold text-[#7f1d1d]">💸 Gửi Yêu Cầu Rút Tiền (Admin duyệt)</h3>
              <input type="number" required min={50000} placeholder="Số tiền muốn rút (tối thiểu 50.000đ)" value={withdrawForm.amount} onChange={(e) => setWithdrawForm((f) => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
              <input type="text" required placeholder="Ngân hàng - Số tài khoản - Tên chủ TK" value={withdrawForm.bankInfo} onChange={(e) => setWithdrawForm((f) => ({ ...f, bankInfo: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
              <button type="submit" className="w-full py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">
                Gửi yêu cầu rút tiền
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 seller-card">
            <h3 className="font-bold text-[#7f1d1d] mb-3">Lịch sử đối soát hoa hồng & giao dịch Ví</h3>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
              {wallet.transactions?.length === 0 ? (
                <p className="text-sm text-stone-500">Chưa có giao dịch nào.</p>
              ) : (
                wallet.transactions.map((tx) => (
                  <div key={tx.TransactionID} className="p-3 rounded-xl bg-[#fffaf0] border border-amber-200 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-bold text-[#3b1510]">
                        {tx.Type === 'OrderSettlement' ? '✅ Giải ngân đơn hàng' : '🏦 Yêu cầu rút tiền'} ({tx.Status})
                      </p>
                      <p className="text-stone-600 mt-0.5">{tx.Note}</p>
                      {tx.BankInfo && <p className="text-stone-500">TK: {tx.BankInfo}</p>}
                    </div>
                    <span className={`font-extrabold text-sm ${tx.Type === 'Withdrawal' ? 'text-red-700' : 'text-emerald-700'}`}>
                      {tx.Type === 'Withdrawal' ? '-' : '+'}{formatVND(tx.Amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerCenterPage;
