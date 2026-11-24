import React, { useEffect, useState } from 'react';
import {
  Store,
  BookOpen,
  Truck,
  Scale,
  Star,
  Flame,
  CheckCircle2,
  XCircle,
  Eye,
  MapPin,
  Tag,
  X,
} from 'lucide-react';
import { managerService, voucherService, formatVND } from '../../services/api';
import './ManagerDashboardPage.css';

const TRACKING_STAGES = [
  { stage: 'PickedUp', title: 'Đơn vị vận chuyển đã lấy hàng từ Shop' },
  { stage: 'InTransit', title: 'Đơn hàng đang trung chuyển giữa các tỉnh' },
  { stage: 'AtWarehouse', title: 'Đơn hàng đã đến kho phân loại khu vực' },
  { stage: 'OutForDelivery', title: 'Tài xế đang giao sách đến địa chỉ khách hàng' },
  { stage: 'Delivered', title: 'Giao hàng thành công' },
  { stage: 'DeliveryFailed', title: 'Giao hàng không thành công - Hẹn giao lại' },
  { stage: 'Returned', title: 'Hoàn trả kiện hàng về Shop' },
];

const ManagerDashboardPage = () => {
  const [activeTab, setActiveTab] = useState('books');
  const [overview, setOverview] = useState({});
  const [shops, setShops] = useState([]);
  const [books, setBooks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [notice, setNotice] = useState('');

  // Modal đọc chi tiết bài bán sách để Manager kiểm tra kỹ trước khi duyệt
  const [inspectBook, setInspectBook] = useState(null);

  // Form cập nhật hành trình vận chuyển cho từng đơn hàng
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [trackingForm, setTrackingForm] = useState({
    stage: 'InTransit',
    title: 'Đơn hàng đang trung chuyển giữa các tỉnh',
    location: '',
    description: '',
  });

  // Form tạo Voucher Sàn / Freeship
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    title: '',
    scope: 'Platform',
    discountType: 'Percent',
    discountValue: 10,
    maxDiscount: 40000,
    minOrderValue: 100000,
    usageLimit: 200,
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const loadAll = async () => {
    try {
      const [ov, sh, bk, ord, disp, rev, vou] = await Promise.all([
        managerService.getOverview(),
        managerService.getShops(),
        managerService.getBooks(),
        managerService.getOrders(),
        managerService.getDisputes(),
        managerService.getReviews(),
        voucherService.getVouchers({ includeAll: 1 }),
      ]);
      setOverview(ov.data?.data || {});
      setShops(sh.data?.data || []);
      setBooks(bk.data?.data || []);
      const ordList = ord.data?.data || [];
      setOrders(ordList);
      if (ordList.length > 0 && !selectedOrderId) {
        setSelectedOrderId(ordList[0].OrderID);
      }
      setDisputes(disp.data?.data || []);
      setReviews(rev.data?.data || []);
      setVouchers((vou.data?.data || []).filter((v) => v.Scope !== 'Shop'));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleReviewShop = async (shopId, status) => {
    let rejectionReason = '';
    if (status !== 'Approved') {
      rejectionReason = window.prompt(`Nhập lý do ${status === 'Rejected' ? 'từ chối' : 'tạm khóa'} Gian hàng:`);
      if (!rejectionReason) return;
    }
    try {
      const res = await managerService.reviewShop(shopId, { status, rejectionReason });
      flash(res.data?.message || 'Đã cập nhật duyệt Shop.');
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Lỗi duyệt Shop.');
    }
  };

  const handleReviewBook = async (bookId, status) => {
    let rejectionReason = '';
    if (status !== 'Approved') {
      rejectionReason = window.prompt(`Nhập lý do ${status === 'Rejected' ? 'từ chối bài đăng' : 'tạm gỡ sách vi phạm'}:`);
      if (!rejectionReason) return;
    }
    try {
      const res = await managerService.reviewBook(bookId, { status, rejectionReason });
      flash(res.data?.message || 'Đã xử lý kiểm duyệt bài bán sách.');
      setInspectBook(null);
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Lỗi kiểm duyệt sách.');
    }
  };

  const handleAddTracking = async (e) => {
    e.preventDefault();
    if (!selectedOrderId) return;
    try {
      const res = await managerService.addTrackingEvent(selectedOrderId, trackingForm);
      flash(res.data?.message || 'Đã cập nhật mốc vận chuyển cho khách hàng!');
      setTrackingForm((f) => ({ ...f, location: '', description: '' }));
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Không thể ghi mốc vận chuyển.');
    }
  };

  const handleResolveDispute = async (disputeId, decision) => {
    const note = window.prompt(
      decision === 'ResolvedRefund'
        ? 'Nhập kết luận CHẤP THUẬN HOÀN TIỀN cho khách hàng:'
        : 'Nhập kết luận TỪ CHỐI KHIẾU NẠI (giải ngân cho Shop):'
    );
    if (!note) return;
    try {
      const res = await managerService.resolveDispute(disputeId, { decision, resolutionNote: note });
      flash(res.data?.message || 'Đã phân xử khiếu nại.');
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Lỗi phân xử.');
    }
  };

  const handleToggleFlashSale = async (book) => {
    if (book.IsFlashSale) {
      await managerService.toggleFlashSale(book.BookID, { isFlashSale: false });
      flash('Đã tắt Flash Sale.');
      loadAll();
      return;
    }
    const price = window.prompt(`Nhập giá Flash Sale cho "${book.Title}" (Giá hiện tại: ${book.DiscountPrice || book.Price}):`, String(Math.round((book.DiscountPrice || book.Price) * 0.85)));
    if (!price) return;
    await managerService.toggleFlashSale(book.BookID, { isFlashSale: true, flashSalePrice: Number(price), flashSaleDays: 5 });
    flash('Đã bật Flash Sale Tết!');
    loadAll();
  };

  const handleCreatePlatformVoucher = async (e) => {
    e.preventDefault();
    try {
      const res = await voucherService.createVoucher(voucherForm);
      flash(res.data?.message || 'Đã tạo Voucher Sàn!');
      setVoucherForm((f) => ({ ...f, code: '', title: '' }));
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Lỗi tạo voucher.');
    }
  };

  const selectedOrder = orders.find((o) => o.OrderID === selectedOrderId);

  return (
    <div className="manager-tet-page max-w-7xl mx-auto px-4 py-8 relative">

      {/* Banner tổng quan Manager */}
      <div className="manager-header mb-6 relative z-10">
        <div>
          <span className="text-xs uppercase tracking-widest text-amber-300 font-bold">Tác Nhân Thứ 3 • Quản Lý Vận Hành Sàn</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#fef3c7] mt-1">
            🏮 Trung Tâm Kiểm Duyệt & Điều Phối Vận Chuyển
          </h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
          <div className="manager-kpi"><strong>{overview.PendingBooks || 0}</strong><span>Sách chờ duyệt</span></div>
          <div className="manager-kpi"><strong>{overview.PendingShops || 0}</strong><span>Shop chờ duyệt</span></div>
          <div className="manager-kpi"><strong>{overview.ActiveOrders || 0}</strong><span>Đơn đang giao</span></div>
          <div className="manager-kpi"><strong>{overview.OpenDisputes || 0}</strong><span>Khiếu nại mở</span></div>
          <div className="manager-kpi"><strong>{overview.ReportedReviews || 0}</strong><span>Review báo cáo</span></div>
        </div>
      </div>

      {notice && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-100 border border-amber-500 text-[#7f1d1d] font-bold text-sm relative z-10">
          🔔 {notice}
        </div>
      )}

      {/* Tabs chức năng của Manager */}
      <div className="flex flex-wrap gap-2 mb-6 relative z-10">
        {[
          { id: 'books', label: `A. Duyệt Bài Bán Sách (${overview.PendingBooks || 0})`, icon: BookOpen },
          { id: 'shops', label: `B. Duyệt Mở Shop (${overview.PendingShops || 0})`, icon: Store },
          { id: 'tracking', label: `Cập Nhật Hành Trình Đơn (${orders.length})`, icon: Truck },
          { id: 'disputes', label: `C. Trọng Tài Khiếu Nại (${overview.OpenDisputes || 0})`, icon: Scale },
          { id: 'reviews', label: `D1. Duyệt Đánh Giá`, icon: Star },
          { id: 'promos', label: `D2. Voucher Sàn & Flash Sale`, icon: Flame },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`manager-tab-btn ${activeTab === t.id ? 'is-active' : ''}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB A: ĐỌC & DUYỆT BÀI BÁN SÁCH CỦA KHÁCH HÀNG */}
      {activeTab === 'books' && (
        <div className="manager-card overflow-x-auto relative z-10">
          <h2 className="text-lg font-bold text-[#7f1d1d] mb-4">📚 Danh sách bài đăng bán sách từ các Gian hàng</h2>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-amber-200 text-xs text-[#7f1d1d]">
                <th className="py-2.5 px-2">Bài đăng sách</th>
                <th className="py-2.5 px-2">Gian hàng / Người đăng</th>
                <th className="py-2.5 px-2">Giá & Tình trạng</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                <th className="py-2.5 px-2 text-right">Kiểm duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {books.map((b) => (
                <tr key={b.BookID} className={b.ApprovalStatus === 'Pending' ? 'bg-amber-50/70' : ''}>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2.5">
                      <img src={b.CoverImage || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=100&q=80'} alt={b.Title} className="w-10 h-14 rounded object-cover border border-amber-200" />
                      <div>
                        <p className="font-bold text-[#3b1510]">{b.Title}</p>
                        <p className="text-xs text-stone-500">ISBN: {b.ISBN} • Kho: {b.Stock}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-xs">
                    <p className="font-bold text-[#7f1d1d]">{b.ShopName}</p>
                    <p className="text-stone-500">{b.SellerName}</p>
                  </td>
                  <td className="py-3 px-2 text-xs">
                    <p className="font-extrabold text-[#b91c1c]">{formatVND(b.DiscountPrice || b.Price)}</p>
                    <p className="text-stone-600">{b.BookCondition}</p>
                  </td>
                  <td className="py-3 px-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      b.ApprovalStatus === 'Pending' ? 'bg-amber-200 text-amber-900' :
                      b.ApprovalStatus === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {b.ApprovalStatus}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setInspectBook(b)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-[#7f1d1d] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Đọc bài
                    </button>
                    {b.ApprovalStatus !== 'Approved' && (
                      <button
                        type="button"
                        onClick={() => handleReviewBook(b.BookID, 'Approved')}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                      >
                        Duyệt
                      </button>
                    )}
                    {b.ApprovalStatus === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleReviewBook(b.BookID, 'Rejected')}
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                      >
                        Từ chối
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB B: DUYỆT ĐĂNG KÝ MỞ SHOP */}
      {activeTab === 'shops' && (
        <div className="space-y-4 relative z-10">
          {shops.map((s) => (
            <div key={s.ShopID} className={`manager-card flex flex-wrap items-start justify-between gap-4 ${s.ApprovalStatus === 'Pending' ? 'border-2 border-[#b91c1c]' : ''}`}>
              <div className="flex items-start gap-3">
                <img src={s.LogoUrl || 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=150&q=80'} alt={s.ShopName} className="w-14 h-14 rounded-xl object-cover border border-amber-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-[#7f1d1d]">{s.ShopName}</h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">{s.ApprovalStatus}</span>
                  </div>
                  <p className="text-xs text-stone-600 mt-0.5">Chủ Shop: <strong>{s.OwnerName}</strong> ({s.OwnerEmail}) • SĐT: {s.Phone}</p>
                  <p className="text-xs text-stone-600">📍 Kho lấy hàng: {s.PickupAddress}</p>
                  <p className="text-xs text-stone-700 mt-1">{s.Description}</p>
                  {s.RejectionReason && <p className="text-xs text-red-700 font-semibold mt-1">Ghi chú khóa/từ chối: {s.RejectionReason}</p>}
                </div>
              </div>

              <div className="flex gap-2">
                {s.ApprovalStatus !== 'Approved' && (
                  <button type="button" onClick={() => handleReviewShop(s.ShopID, 'Approved')} className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Duyệt mở Shop
                  </button>
                )}
                {s.ApprovalStatus === 'Pending' && (
                  <button type="button" onClick={() => handleReviewShop(s.ShopID, 'Rejected')} className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold inline-flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Từ chối
                  </button>
                )}
                {s.ApprovalStatus === 'Approved' && s.ShopID !== 1 && (
                  <button type="button" onClick={() => handleReviewShop(s.ShopID, 'Suspended')} className="px-3 py-2 rounded-xl border border-red-300 text-red-700 text-xs font-bold">
                    Tạm khóa Shop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB CẬP NHẬT HÀNH TRÌNH VẬN CHUYỂN CHI TIẾT */}
      {activeTab === 'tracking' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
          {/* Cột trái: Danh sách đơn hàng */}
          <div className="lg:col-span-5 manager-card max-h-[640px] overflow-y-auto space-y-2.5">
            <h2 className="font-bold text-[#7f1d1d] text-base mb-2">🚚 Chọn đơn hàng để ghi hành trình</h2>
            {orders.map((ord) => (
              <button
                key={ord.OrderID}
                type="button"
                onClick={() => setSelectedOrderId(ord.OrderID)}
                className={`w-full text-left p-3 rounded-xl border transition ${
                  selectedOrderId === ord.OrderID
                    ? 'bg-red-50 border-[#b91c1c] ring-1 ring-[#b91c1c]'
                    : 'bg-[#fffaf0] border-amber-200 hover:bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[#7f1d1d]">Đơn #{ord.OrderID} • {ord.TrackingNumber}</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">{ord.Status}</span>
                </div>
                <p className="text-xs text-stone-700 mt-1">Shop: <strong>{ord.ShopName}</strong> → Khách: <strong>{ord.CustomerName}</strong></p>
                <p className="text-[11px] text-stone-500 mt-0.5 truncate">📍 {ord.ShippingAddress}</p>
              </button>
            ))}
          </div>

          {/* Cột phải: Form ghi chặng vận chuyển + Timeline hiện tại */}
          <div className="lg:col-span-7 space-y-4">
            {!selectedOrder ? (
              <div className="manager-card text-center py-12 text-stone-500">Chọn một đơn hàng bên trái.</div>
            ) : (
              <>
                <form onSubmit={handleAddTracking} className="manager-card space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                    <h3 className="font-bold text-[#7f1d1d] flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#b91c1c]" /> Ghi chặng vận chuyển mới — Đơn #{selectedOrder.OrderID}
                    </h3>
                    <span className="text-xs font-bold text-amber-800">{selectedOrder.PaymentType} ({selectedOrder.PaymentStatus})</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold block mb-1">Giai đoạn vận chuyển *</label>
                    <select
                      value={trackingForm.stage}
                      onChange={(e) => {
                        const st = TRACKING_STAGES.find((s) => s.stage === e.target.value);
                        setTrackingForm((f) => ({
                          ...f,
                          stage: e.target.value,
                          title: st ? st.title : f.title,
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white"
                    >
                      {TRACKING_STAGES.map((s) => (
                        <option key={s.stage} value={s.stage}>{s.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold block mb-1">Tiêu đề hiển thị cho khách hàng *</label>
                    <input
                      type="text"
                      required
                      value={trackingForm.title}
                      onChange={(e) => setTrackingForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold block mb-1">Vị trí / Kho hiện tại (Khách sẽ nhìn thấy)</label>
                    <input
                      type="text"
                      required
                      value={trackingForm.location}
                      onChange={(e) => setTrackingForm((f) => ({ ...f, location: e.target.value }))}
                      placeholder="VD: Kho phân loại Bình Tân, TP.HCM hoặc Bưu cục Quận 1"
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold block mb-1">Ghi chú chi tiết (SĐT shipper, dự kiến giao...)</label>
                    <textarea
                      rows={2}
                      value={trackingForm.description}
                      onChange={(e) => setTrackingForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="VD: Tài xế Nguyễn Văn B (0901xxx) đang giao tới người nhận..."
                      className="w-full p-2.5 rounded-xl border border-amber-300 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-amber-100 font-extrabold text-sm border border-amber-400"
                  >
                    📍 Lưu mốc hành trình & Báo ngay cho Khách hàng
                  </button>
                </form>

                <div className="manager-card">
                  <h4 className="font-bold text-sm text-[#7f1d1d] mb-3">
                    Lịch sử hành trình hiện tại ({selectedOrder.trackingEvents?.length || 0} mốc)
                  </h4>
                  <div className="space-y-2.5 max-h-64 overflow-y-auto">
                    {(selectedOrder.trackingEvents || []).map((ev) => (
                      <div key={ev.EventID} className="p-2.5 rounded-xl bg-[#fffaf0] border border-amber-200 text-xs">
                        <div className="flex justify-between font-bold text-[#3b1510]">
                          <span>{ev.Title}</span>
                          <span className="text-stone-500">{new Date(ev.CreatedAt).toLocaleString('vi-VN')}</span>
                        </div>
                        {ev.Location && <p className="text-[#b91c1c] font-semibold mt-0.5">📍 {ev.Location}</p>}
                        {ev.Description && <p className="text-stone-600 mt-0.5">{ev.Description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB C: TRỌNG TÀI KHIẾU NẠI / HOÀN TIỀN */}
      {activeTab === 'disputes' && (
        <div className="space-y-4 relative z-10">
          {disputes.length === 0 ? (
            <div className="manager-card text-center py-12 text-stone-500">Không có khiếu nại nào trên sàn.</div>
          ) : (
            disputes.map((d) => (
              <div key={d.DisputeID} className="manager-card space-y-2.5">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-bold text-[#7f1d1d]">Khiếu nại #{d.DisputeID} • Đơn #{d.OrderID} ({formatVND(d.TotalAmount)})</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-900">{d.Status}</span>
                </div>
                <p className="text-xs text-stone-600">Khách: <strong>{d.BuyerName}</strong> khiếu nại Shop: <strong>{d.ShopName}</strong></p>
                <p className="text-sm font-bold text-red-800">Lý do: {d.Reason}</p>
                <p className="text-sm text-stone-700">{d.Description}</p>
                {d.evidenceImages?.length > 0 && (
                  <div className="flex gap-2">
                    {d.evidenceImages.map((img, i) => <img key={i} src={img} alt="evidence" className="w-20 h-20 rounded-lg object-cover border border-amber-300" />)}
                  </div>
                )}
                {d.ResolutionNote && <p className="text-xs bg-amber-50 p-2.5 rounded-lg border border-amber-300">Kết luận: {d.ResolutionNote}</p>}
                {['Open', 'Reviewing'].includes(d.Status) && (
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => handleResolveDispute(d.DisputeID, 'ResolvedRefund')} className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold">
                      Chấp thuận Hoàn tiền cho Khách
                    </button>
                    <button type="button" onClick={() => handleResolveDispute(d.DisputeID, 'ResolvedReject')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                      Từ chối Khiếu nại (Giải ngân Shop)
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB D1: KIỂM DUYỆT ĐÁNH GIÁ */}
      {activeTab === 'reviews' && (
        <div className="manager-card space-y-3 relative z-10">
          <h2 className="font-bold text-[#7f1d1d]">⭐ Kiểm duyệt đánh giá & bình luận</h2>
          {reviews.map((r) => (
            <div key={r.ReviewID} className={`p-3.5 rounded-xl border flex flex-wrap justify-between gap-3 ${r.Status === 'Reported' ? 'bg-red-50 border-red-300' : 'bg-[#fffaf0] border-amber-200'}`}>
              <div className="text-xs space-y-1">
                <p className="font-bold text-[#3b1510]">
                  {r.ReviewerName} đánh giá {r.Rating}★ cho "{r.BookTitle}" ({r.ShopName}) — <span className="text-[#b91c1c]">{r.Status}</span>
                </p>
                <p className="text-stone-700">{r.Comment}</p>
                {r.ReportReason && <p className="text-red-700 font-semibold">⚠️ Lý do bị báo cáo: {r.ReportReason}</p>}
              </div>
              <div className="flex gap-2 items-center">
                {r.Status !== 'Hidden' ? (
                  <button type="button" onClick={async () => { await managerService.moderateReview(r.ReviewID, { status: 'Hidden' }); flash('Đã ẩn đánh giá vi phạm.'); loadAll(); }} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">
                    Ẩn đánh giá
                  </button>
                ) : (
                  <button type="button" onClick={async () => { await managerService.moderateReview(r.ReviewID, { status: 'Visible' }); flash('Đã khôi phục đánh giá.'); loadAll(); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                    Hiện lại
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB D2: VOUCHER SÀN & FLASH SALE */}
      {activeTab === 'promos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
          <form onSubmit={handleCreatePlatformVoucher} className="lg:col-span-5 manager-card space-y-3">
            <h3 className="font-bold text-[#7f1d1d] flex items-center gap-1.5"><Tag className="w-4 h-4" /> Tạo Voucher Sàn / Freeship</h3>
            <input type="text" required placeholder="Mã (VD: TETXUAN50)" value={voucherForm.code} onChange={(e) => setVoucherForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm uppercase" />
            <input type="text" required placeholder="Tên chương trình" value={voucherForm.title} onChange={(e) => setVoucherForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={voucherForm.scope} onChange={(e) => setVoucherForm((f) => ({ ...f, scope: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white">
                <option value="Platform">Voucher Sàn</option>
                <option value="Freeship">Mã Freeship</option>
              </select>
              <select value={voucherForm.discountType} onChange={(e) => setVoucherForm((f) => ({ ...f, discountType: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white">
                <option value="Percent">Giảm %</option>
                <option value="Fixed">Giảm tiền (VNĐ)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" required placeholder="Giá trị giảm" value={voucherForm.discountValue} onChange={(e) => setVoucherForm((f) => ({ ...f, discountValue: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm" />
              <input type="date" required value={voucherForm.endDate} onChange={(e) => setVoucherForm((f) => ({ ...f, endDate: e.target.value }))} className="px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">Phát hành Voucher Sàn</button>

            <div className="pt-3 border-t border-amber-200 space-y-2">
              <p className="text-xs font-bold text-stone-600">Voucher Sàn hiện có:</p>
              {vouchers.map((v) => (
                <div key={v.VoucherID} className="flex justify-between items-center text-xs bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  <span><strong>{v.Code}</strong> ({v.Scope}) — {v.Title}</span>
                  <button type="button" onClick={async () => { await voucherService.deleteVoucher(v.VoucherID); loadAll(); }} className="text-red-600 font-bold">Xóa</button>
                </div>
              ))}
            </div>
          </form>

          <div className="lg:col-span-7 manager-card space-y-3">
            <h3 className="font-bold text-[#7f1d1d] flex items-center gap-1.5"><Flame className="w-4 h-4 text-amber-600" /> Bật / Tắt Flash Sale Tết cho Sách đã duyệt</h3>
            <div className="space-y-2 max-h-[440px] overflow-y-auto">
              {books.filter((b) => b.ApprovalStatus === 'Approved').map((b) => (
                <div key={b.BookID} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#fffaf0] border border-amber-200 text-xs">
                  <div>
                    <p className="font-bold text-[#3b1510]">{b.Title}</p>
                    <p className="text-stone-500">{b.ShopName} • Giá gốc: {formatVND(b.DiscountPrice || b.Price)} {b.IsFlashSale ? `• 🔥 Flash: ${formatVND(b.FlashSalePrice)}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleFlashSale(b)}
                    className={`px-3 py-1.5 rounded-lg font-bold shrink-0 ${
                      b.IsFlashSale ? 'bg-stone-200 text-stone-700' : 'bg-amber-500 text-[#450a0a]'
                    }`}
                  >
                    {b.IsFlashSale ? 'Tắt Flash' : 'Bật Flash Sale'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ĐỌC CHI TIẾT BÀI ĐĂNG BÁN SÁCH TRƯỚC KHI DUYỆT */}
      {inspectBook && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#fffaf0] border-2 border-amber-500 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#991b1b] text-amber-100">
              <span className="font-bold">🔎 Kiểm duyệt chi tiết bài đăng #{inspectBook.BookID}</span>
              <button type="button" onClick={() => setInspectBook(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-sm">
              <div className="flex flex-col sm:flex-row gap-4">
                <img src={inspectBook.CoverImage || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=300&q=80'} alt={inspectBook.Title} className="w-36 h-48 rounded-xl object-cover border border-amber-400 shrink-0" />
                <div className="space-y-1.5">
                  <h3 className="text-xl font-extrabold text-[#7f1d1d]">{inspectBook.Title}</h3>
                  <p className="text-xs text-stone-600">Gian hàng: <strong>{inspectBook.ShopName}</strong> • Người đăng: <strong>{inspectBook.SellerName}</strong></p>
                  <p>Giá bìa: <strong>{formatVND(inspectBook.Price)}</strong> • Giá bán: <strong className="text-[#b91c1c]">{formatVND(inspectBook.DiscountPrice || inspectBook.Price)}</strong></p>
                  <p>ISBN: <strong>{inspectBook.ISBN}</strong> • Tình trạng: <strong>{inspectBook.BookCondition}</strong> • Kho: <strong>{inspectBook.Stock}</strong></p>
                  <p>Tác giả: <strong>{inspectBook.AuthorNames || '—'}</strong> • NXB: <strong>{inspectBook.PublisherName || '—'}</strong></p>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-amber-200">
                <p className="text-xs font-bold text-[#7f1d1d] mb-1">Nội dung mô tả bài đăng:</p>
                <p className="whitespace-pre-line text-stone-700">{inspectBook.Description || '(Không có mô tả)'}</p>
              </div>
              {inspectBook.previewImages?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-[#7f1d1d] mb-1.5">Ảnh trang đọc thử đính kèm:</p>
                  <div className="flex gap-2 overflow-x-auto">
                    {inspectBook.previewImages.map((u, i) => <img key={i} src={u} alt="prev" className="h-32 rounded-lg border border-amber-300" />)}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-200">
                <button type="button" onClick={() => handleReviewBook(inspectBook.BookID, 'Approved')} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs">
                  ✅ Duyệt bài cho lên kệ bán ngay
                </button>
                <button type="button" onClick={() => handleReviewBook(inspectBook.BookID, 'Rejected')} className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs">
                  ❌ Từ chối & Gửi lý do cho Người bán
                </button>
                <button type="button" onClick={() => handleReviewBook(inspectBook.BookID, 'Suspended')} className="px-4 py-2.5 rounded-xl bg-stone-700 text-white font-bold text-xs">
                  🚫 Gỡ sách vi phạm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboardPage;
