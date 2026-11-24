import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Star,
  FileDown,
  Store,
  XCircle,
  Clock,
  X,
  QrCode,
} from 'lucide-react';
import { orderService, reviewService, disputeService, uploadFilesToServer, formatVND } from '../../services/api';
import QrPaymentModal from '../../components/QrPaymentModal/QrPaymentModal';
import './OrdersHistoryPage.css';

const STATUS_LABELS = {
  Pending: 'Chờ Shop xác nhận',
  Confirmed: 'Shop đã xác nhận',
  Packing: 'Đang đóng gói',
  Shipping: 'Đang vận chuyển',
  Delivered: 'Đã giao thành công',
  Completed: 'Hoàn tất',
  Cancelled: 'Đã hủy',
  Disputed: 'Đang khiếu nại',
  Refunded: 'Đã hoàn tiền',
};

const STEP_INDEX = {
  Pending: 0,
  Confirmed: 1,
  Packing: 1,
  Shipping: 2,
  Delivered: 3,
  Completed: 4,
};

const OrdersHistoryPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [message, setMessage] = useState('');

  // Modal Đánh giá
  const [reviewModal, setReviewModal] = useState(null); // { orderId, bookId, title }
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', images: [] });

  // Modal Quét mã QR thanh toán cho đơn Prepaid còn Unpaid
  const [qrModalData, setQrModalData] = useState(null);

  // Modal Khiếu nại / Trả hàng hoàn tiền
  const [disputeModal, setDisputeModal] = useState(null); // order
  const [disputeForm, setDisputeForm] = useState({
    reason: 'Sách bị rách / hư hỏng khi vận chuyển',
    description: '',
    evidenceImages: [],
  });

  const loadOrders = async () => {
    try {
      const res = await orderService.getMyOrders();
      const list = res.data?.data || [];
      setOrders(list);
      if (list.length > 0 && !expandedOrderId) {
        setExpandedOrderId(list[0].OrderID);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const flashMsg = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3500);
  };

  const handleOpenQrForOrder = async (order) => {
    try {
      const res = await orderService.createQrSession(order.OrderID);
      if (res.data?.data) {
        setQrModalData({ qrPayment: res.data.data, orders: [order] });
      }
    } catch (err) {
      flashMsg(err.response?.data?.message || 'Không thể khởi tạo mã QR thanh toán.');
    }
  };

  const handleConfirmReceived = async (orderId) => {
    if (!window.confirm('Xác nhận bạn đã nhận đủ sách và hài lòng? Hệ thống sẽ hoàn tất đơn và giải ngân cho Shop.')) return;
    try {
      const res = await orderService.confirmReceived(orderId);
      flashMsg(res.data?.message || 'Đã xác nhận nhận hàng!');
      loadOrders();
    } catch (err) {
      flashMsg(err.response?.data?.message || 'Lỗi xác nhận.');
    }
  };

  const handleCancelOrder = async (orderId) => {
    const reason = window.prompt('Nhập lý do hủy đơn:', 'Thay đổi địa chỉ / nhu cầu');
    if (reason === null) return;
    try {
      const res = await orderService.cancelOrder(orderId, reason);
      flashMsg(res.data?.message || 'Đã hủy đơn.');
      loadOrders();
    } catch (err) {
      flashMsg(err.response?.data?.message || 'Không thể hủy đơn.');
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    try {
      await reviewService.createReview({
        orderId: reviewModal.orderId,
        bookId: reviewModal.bookId,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        images: reviewForm.images,
      });
      setReviewModal(null);
      setReviewForm({ rating: 5, comment: '', images: [] });
      flashMsg('Cảm ơn bạn đã gửi đánh giá sách!');
      loadOrders();
    } catch (err) {
      flashMsg(err.response?.data?.message || 'Không thể gửi đánh giá.');
    }
  };

  const handleSubmitDispute = async (e) => {
    e.preventDefault();
    try {
      await disputeService.createDispute({
        orderId: disputeModal.OrderID,
        reason: disputeForm.reason,
        description: disputeForm.description,
        evidenceImages: disputeForm.evidenceImages,
      });
      setDisputeModal(null);
      setDisputeForm({ reason: 'Sách bị rách / hư hỏng khi vận chuyển', description: '', evidenceImages: [] });
      flashMsg('Đã gửi yêu cầu khiếu nại lên Quản lý sàn phân xử!');
      loadOrders();
    } catch (err) {
      flashMsg(err.response?.data?.message || 'Không thể gửi khiếu nại.');
    }
  };

  const handleExportPdf = async (order) => {
    const { default: html2pdf } = await import('html2pdf.js');
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #3b1510;">
        <h2 style="color: #b91c1c; margin-bottom: 4px;">HÓA ĐƠN MUA SÁCH VITABOOK</h2>
        <p style="font-size: 12px;">Mã đơn: #${order.OrderID} | Mã vận đơn: ${order.TrackingNumber || '—'} | Ngày: ${new Date(order.CreatedAt).toLocaleString('vi-VN')}</p>
        <p style="font-size: 12px;">Gian hàng: <b>${order.ShopName}</b> | Thanh toán: <b>${order.PaymentType} (${order.PaymentMethod}) - ${order.PaymentStatus}</b></p>
        <p style="font-size: 12px;">Giao tới: ${order.ShippingAddress} (SĐT: ${order.Phone})</p>
        <hr style="margin: 12px 0;" />
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #fef3c7;">
              <th style="text-align:left; padding:6px; border:1px solid #d97706;">Sách</th>
              <th style="text-align:right; padding:6px; border:1px solid #d97706;">SL</th>
              <th style="text-align:right; padding:6px; border:1px solid #d97706;">Đơn giá</th>
              <th style="text-align:right; padding:6px; border:1px solid #d97706;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${order.items
              .map(
                (i) => `<tr>
                  <td style="padding:6px; border:1px solid #e5e7eb;">${i.Title}</td>
                  <td style="padding:6px; text-align:right; border:1px solid #e5e7eb;">${i.Quantity}</td>
                  <td style="padding:6px; text-align:right; border:1px solid #e5e7eb;">${formatVND(i.UnitPrice)}</td>
                  <td style="padding:6px; text-align:right; border:1px solid #e5e7eb;">${formatVND(i.UnitPrice * i.Quantity)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <p style="text-align:right; margin-top: 14px; font-size: 14px;"><b>Tổng thanh toán: ${formatVND(order.TotalAmount)}</b></p>
      </div>
    `;
    html2pdf().from(html).set({ filename: `VitaBook_Order_${order.OrderID}.pdf`, margin: 10 }).save();
  };

  return (
    <div className="orders-tet-page max-w-6xl mx-auto px-4 py-8 relative">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[#e7ddd0]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#9b1c1c]">Quản lý đơn mua</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1f1712] mt-1">Đơn Hàng & Hành Trình Vận Chuyển</h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            Theo dõi chi tiết từng chặng vận chuyển do Quản lý sàn cập nhật theo thời gian thực
          </p>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3.5 rounded-xl bg-[#fbf6ec] border border-[#dfc99f] text-[#7f1d1d] font-semibold text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-center py-16 text-stone-500">Đang tải danh sách đơn hàng...</p>
      ) : orders.length === 0 ? (
        <div className="orders-card text-center py-14 relative z-10">
          <p className="text-lg font-bold text-[#7f1d1d]">Bạn chưa có đơn hàng nào</p>
          <Link to="/shop" className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">
            Khám phá Chợ Sách
          </Link>
        </div>
      ) : (
        <div className="space-y-5 relative z-10">
          {orders.map((order) => {
            const isExpanded = expandedOrderId === order.OrderID;
            const currentStep = STEP_INDEX[order.Status] ?? -1;

            return (
              <div key={order.OrderID} className="orders-card">
                {/* Header đơn */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-amber-200">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-extrabold text-[#7f1d1d]">Đơn #{order.OrderID}</span>
                    <Link to={`/shops/${order.ShopID}`} className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline">
                      <Store className="w-3.5 h-3.5" /> {order.ShopName}
                    </Link>
                    {order.TrackingNumber && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 border border-amber-300 font-mono">
                        Vận đơn: {order.TrackingNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-[#991b1b]">
                      {STATUS_LABELS[order.Status] || order.Status}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900">
                      {order.PaymentType === 'Prepaid' ? `Trả trước (${order.PaymentMethod})` : 'COD'} • {order.PaymentStatus}
                    </span>
                  </div>
                </div>

                {/* Thanh tiến trình 5 bước */}
                {currentStep >= 0 && (
                  <div className="orders-stepper my-4">
                    {['Đã đặt', 'Shop chuẩn bị', 'Đang vận chuyển', 'Đã giao', 'Hoàn tất'].map((label, idx) => (
                      <div key={label} className={`orders-step ${idx <= currentStep ? 'is-done' : ''}`}>
                        <span className="orders-step-dot">{idx + 1}</span>
                        <span className="orders-step-label">{label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sản phẩm trong đơn */}
                <div className="divide-y divide-amber-100">
                  {order.items?.map((item) => {
                    const alreadyReviewed = order.reviewedBookIds?.includes(item.BookID);
                    return (
                      <div key={item.OrderDetailID} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={item.CoverImage || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=150&q=80'}
                            alt={item.Title}
                            className="w-12 h-16 rounded-lg object-cover border border-amber-200"
                          />
                          <div>
                            <Link to={`/books/${item.BookID}`} className="font-bold text-sm text-[#3b1510] hover:text-[#b91c1c]">
                              {item.Title}
                            </Link>
                            <p className="text-xs text-stone-500">
                              SL: {item.Quantity} × {formatVND(item.UnitPrice)}
                            </p>
                          </div>
                        </div>

                        {['Delivered', 'Completed'].includes(order.Status) && !alreadyReviewed && (
                          <button
                            type="button"
                            onClick={() => setReviewModal({ orderId: order.OrderID, bookId: item.BookID, title: item.Title })}
                            className="px-3 py-1.5 rounded-lg bg-amber-100 border border-amber-400 text-[#7f1d1d] text-xs font-bold inline-flex items-center gap-1 hover:bg-amber-200"
                          >
                            <Star className="w-3.5 h-3.5" /> Viết đánh giá
                          </button>
                        )}
                        {alreadyReviewed && <span className="text-xs text-emerald-700 font-bold">✓ Đã đánh giá</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Thông tin khiếu nại nếu có */}
                {order.dispute && (
                  <div className="mt-3 p-3 rounded-xl bg-orange-50 border border-orange-300 text-xs">
                    <p className="font-bold text-orange-900">
                      ⚖️ Trạng thái Khiếu nại: {order.dispute.Status} — Lý do: {order.dispute.Reason}
                    </p>
                    {order.dispute.ResolutionNote && (
                      <p className="text-stone-700 mt-1">Kết luận từ Quản lý: {order.dispute.ResolutionNote}</p>
                    )}
                  </div>
                )}

                {/* Hành động & Toggle xem Timeline vận chuyển */}
                <div className="mt-4 pt-3 border-t border-amber-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-stone-500">Tổng thanh toán: </span>
                    <span className="text-lg font-extrabold text-[#b91c1c]">{formatVND(order.TotalAmount)}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.OrderID)}
                      className="px-3.5 py-2 rounded-xl bg-amber-100 text-[#7f1d1d] font-bold text-xs inline-flex items-center gap-1.5 hover:bg-amber-200"
                    >
                      <Truck className="w-4 h-4" />
                      {isExpanded ? 'Ẩn hành trình vận chuyển' : `Xem hành trình vận chuyển (${order.trackingEvents?.length || 0} mốc)`}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportPdf(order)}
                      className="px-3 py-2 rounded-xl border border-amber-300 bg-white text-stone-700 font-bold text-xs inline-flex items-center gap-1 hover:bg-amber-50"
                    >
                      <FileDown className="w-3.5 h-3.5" /> Hóa đơn PDF
                    </button>

                    {order.PaymentType === 'Prepaid' && order.PaymentStatus === 'Unpaid' && !['Cancelled', 'Refunded'].includes(order.Status) && (
                      <button
                        type="button"
                        onClick={() => handleOpenQrForOrder(order)}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 text-[#450a0a] font-extrabold text-xs inline-flex items-center gap-1.5 hover:bg-amber-400"
                      >
                        <QrCode className="w-4 h-4" /> Quét mã QR thanh toán
                      </button>
                    )}

                    {order.Status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order.OrderID)}
                        className="px-3 py-2 rounded-xl bg-red-50 border border-red-300 text-red-700 font-bold text-xs inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Hủy đơn
                      </button>
                    )}

                    {order.Status === 'Delivered' && (
                      <button
                        type="button"
                        onClick={() => handleConfirmReceived(order.OrderID)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs inline-flex items-center gap-1 hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Đã nhận được hàng
                      </button>
                    )}

                    {['Shipping', 'Delivered'].includes(order.Status) && !order.dispute && (
                      <button
                        type="button"
                        onClick={() => setDisputeModal(order)}
                        className="px-3 py-2 rounded-xl bg-orange-100 border border-orange-400 text-orange-900 font-bold text-xs inline-flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" /> Khiếu nại / Hoàn tiền
                      </button>
                    )}
                  </div>
                </div>

                {/* TIMELINE HÀNH TRÌNH VẬN CHUYỂN CHI TIẾT */}
                {isExpanded && (
                  <div className="orders-timeline-box mt-4">
                    <h3 className="text-sm font-extrabold text-[#7f1d1d] mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#b91c1c]" />
                      Chi tiết hành trình đơn hàng #{order.OrderID} (Cập nhật bởi Quản lý vận chuyển)
                    </h3>
                    {!order.trackingEvents || order.trackingEvents.length === 0 ? (
                      <p className="text-xs text-stone-500">Chưa có mốc vận chuyển nào.</p>
                    ) : (
                      <ol className="orders-timeline-list">
                        {order.trackingEvents.map((ev, idx) => (
                          <li key={ev.EventID} className={`orders-timeline-item ${idx === 0 ? 'is-latest' : ''}`}>
                            <span className="orders-timeline-node" />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-bold text-[#3b1510]">{ev.Title}</p>
                              <span className="text-[11px] text-stone-500 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {new Date(ev.CreatedAt).toLocaleString('vi-VN')}
                              </span>
                            </div>
                            {ev.Location && (
                              <p className="text-xs font-semibold text-[#b91c1c] mt-0.5">📍 Vị trí: {ev.Location}</p>
                            )}
                            {ev.Description && <p className="text-xs text-stone-600 mt-0.5">{ev.Description}</p>}
                            {ev.UpdatedByName && (
                              <p className="text-[10px] text-stone-400 mt-1">
                                Ghi nhận bởi: {ev.UpdatedByName} ({ev.UpdatedByRole})
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {qrModalData && (
        <QrPaymentModal
          qrPayment={qrModalData.qrPayment}
          orders={qrModalData.orders}
          onPaidSuccess={() => {
            flashMsg('Thanh toán QR thành công! Đơn hàng đã chuyển sang Sàn giữ tiền hộ (Escrow).');
            loadOrders();
          }}
          onClose={() => {
            setQrModalData(null);
            loadOrders();
          }}
        />
      )}

      {/* MODAL VIẾT ĐÁNH GIÁ */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <form onSubmit={handleSubmitReview} className="bg-[#fffaf0] border-2 border-amber-500 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-[#7f1d1d]">⭐ Đánh giá sách</h3>
              <button type="button" onClick={() => setReviewModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm font-semibold text-stone-700">{reviewModal.title}</p>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewForm((f) => ({ ...f, rating: star }))}
                  className={`text-2xl ${star <= reviewForm.rating ? 'text-amber-500' : 'text-stone-300'}`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              required
              value={reviewForm.comment}
              onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Chia sẻ cảm nhận về chất lượng giấy, đóng gói, nội dung sách..."
              className="w-full p-3 rounded-xl border border-amber-300 text-sm"
            />
            <div>
              <label className="text-xs font-bold block mb-1">Tải ảnh thực tế sách (tùy chọn):</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={async (e) => {
                  const urls = await uploadFilesToServer(e.target.files);
                  setReviewForm((f) => ({ ...f, images: [...f.images, ...urls] }));
                }}
                className="text-xs"
              />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">
              Gửi đánh giá
            </button>
          </form>
        </div>
      )}

      {/* MODAL KHIẾU NẠI / HOÀN TIỀN */}
      {disputeModal && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <form onSubmit={handleSubmitDispute} className="bg-[#fffaf0] border-2 border-amber-500 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-[#7f1d1d]">⚖️ Yêu cầu Khiếu nại / Trả hàng Hoàn tiền</h3>
              <button type="button" onClick={() => setDisputeModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-stone-600">Đơn hàng #{disputeModal.OrderID} — Quản lý sàn sẽ làm trọng tài phân xử.</p>
            <div>
              <label className="text-xs font-bold block mb-1">Lý do khiếu nại</label>
              <select
                value={disputeForm.reason}
                onChange={(e) => setDisputeForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full p-2.5 rounded-xl border border-amber-300 text-sm bg-white"
              >
                <option>Sách bị rách / hư hỏng khi vận chuyển</option>
                <option>Giao sai cuốn sách / thiếu số lượng</option>
                <option>Nghi ngờ sách in lậu / sai tình trạng mô tả</option>
                <option>Chưa nhận được hàng dù hệ thống báo đã giao</option>
              </select>
            </div>
            <textarea
              rows={3}
              required
              value={disputeForm.description}
              onChange={(e) => setDisputeForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả chi tiết tình trạng sách bạn nhận được..."
              className="w-full p-3 rounded-xl border border-amber-300 text-sm"
            />
            <div>
              <label className="text-xs font-bold block mb-1">Ảnh bằng chứng (tùy chọn):</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={async (e) => {
                  const urls = await uploadFilesToServer(e.target.files);
                  setDisputeForm((f) => ({ ...f, evidenceImages: [...f.evidenceImages, ...urls] }));
                }}
                className="text-xs"
              />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-orange-600 text-white font-bold text-sm">
              Gửi khiếu nại lên Quản lý sàn
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default OrdersHistoryPage;
