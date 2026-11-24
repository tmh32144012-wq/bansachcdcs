import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Trash2,
  Store,
  Tag,
  Truck,
  CreditCard,
  Banknote,
  ShieldCheck,
  CheckCircle2,
  QrCode,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { orderService, voucherService, catalogService, formatVND } from '../../services/api';
import QrPaymentModal from '../../components/QrPaymentModal/QrPaymentModal';
import './CartCheckoutPage.css';

const CartCheckoutPage = () => {
  const {
    groupedByShop,
    selectedItems,
    cartSubtotal,
    updateQuantity,
    removeFromCart,
    toggleSelectItem,
    toggleSelectShop,
    removeSelectedItems,
  } = useCart();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [shippingFees, setShippingFees] = useState({ Economy: 15000, Standard: 30000, Express: 50000 });
  const [shippingMethod, setShippingMethod] = useState('Standard');
  const [paymentType, setPaymentType] = useState('COD'); // 'COD' | 'Prepaid'
  const [paymentMethod, setPaymentMethod] = useState('COD'); // 'COD' | 'VIETQR' | 'AGRIBANK' | 'MOMO' | 'ZALOPAY'

  const [shippingAddress, setShippingAddress] = useState(user?.address || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [note, setNote] = useState('');

  const [vouchers, setVouchers] = useState([]);
  const [platformVoucherCode, setPlatformVoucherCode] = useState('');
  const [shopVoucherCodes, setShopVoucherCodes] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [activeQrPayment, setActiveQrPayment] = useState(null);
  const [qrPaidDone, setQrPaidDone] = useState(false);
  const [qrPaidFailed, setQrPaidFailed] = useState(false);

  useEffect(() => {
    if (user) {
      if (!shippingAddress && user.address) setShippingAddress(user.address);
      if (!phone && user.phone) setPhone(user.phone);
    }
  }, [user]);

  useEffect(() => {
    Promise.all([catalogService.getPublicSettings(), voucherService.getVouchers()])
      .then(([setRes, vRes]) => {
        if (setRes.data?.data?.shippingFees) setShippingFees(setRes.data.data.shippingFees);
        setVouchers(vRes.data?.data || []);
      })
      .catch(() => {});
  }, []);

  const selectedShopGroups = useMemo(() => {
    return groupedByShop
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => i.selected !== false),
      }))
      .filter((g) => g.items.length > 0);
  }, [groupedByShop]);

  const totalShipping = selectedShopGroups.length * (shippingFees[shippingMethod] || 30000);

  const estimatedDiscount = useMemo(() => {
    let totalDisc = 0;
    const pv = vouchers.find(
      (v) => v.Code === platformVoucherCode.trim().toUpperCase() && (v.Scope === 'Platform' || v.Scope === 'Freeship')
    );
    if (pv && cartSubtotal >= Number(pv.MinOrderValue || 0)) {
      if (pv.Scope === 'Freeship') {
        totalDisc += Math.min(Number(pv.DiscountValue), shippingFees[shippingMethod] || 30000);
      } else if (pv.DiscountType === 'Percent') {
        const d = (cartSubtotal * Number(pv.DiscountValue)) / 100;
        totalDisc += pv.MaxDiscount ? Math.min(d, Number(pv.MaxDiscount)) : d;
      } else {
        totalDisc += Number(pv.DiscountValue);
      }
    }

    for (const group of selectedShopGroups) {
      const code = (shopVoucherCodes[group.shopId] || '').trim().toUpperCase();
      if (!code) continue;
      const sv = vouchers.find((v) => v.Code === code && v.Scope === 'Shop' && v.ShopID === group.shopId);
      const sub = group.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      if (sv && sub >= Number(sv.MinOrderValue || 0)) {
        if (sv.DiscountType === 'Percent') {
          const d = (sub * Number(sv.DiscountValue)) / 100;
          totalDisc += sv.MaxDiscount ? Math.min(d, Number(sv.MaxDiscount)) : d;
        } else {
          totalDisc += Number(sv.DiscountValue);
        }
      }
    }
    return Math.round(totalDisc);
  }, [vouchers, platformVoucherCode, shopVoucherCodes, selectedShopGroups, cartSubtotal, shippingFees, shippingMethod]);

  const grandTotal = Math.max(0, cartSubtotal + totalShipping - estimatedDiscount);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setError('');

    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/cart' } } });
      return;
    }

    if (selectedItems.length === 0) {
      setError('Vui lòng tick chọn ít nhất 1 cuốn sách để đặt hàng.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        items: selectedItems.map((i) => ({ bookId: i.bookId, quantity: i.quantity })),
        shippingAddress,
        phone,
        note,
        shippingMethod,
        paymentType,
        paymentMethod: paymentType === 'COD' ? 'COD' : paymentMethod,
        platformVoucherCode: platformVoucherCode.trim() || null,
        shopVoucherCodes,
      };
      const res = await orderService.createOrder(payload);
      setSuccessData(res.data);
      if (res.data?.data?.qrPayment) {
        setQrPaidDone(false);
        setQrPaidFailed(false);
        setActiveQrPayment(res.data.data.qrPayment);
      }
      removeSelectedItems();
    } catch (err) {
      setError(err.response?.data?.message || 'Đặt hàng thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successData) {
    const savedQr = successData.data?.qrPayment;
    const isPrepaidOrder = Boolean(savedQr);

    return (
      <div className="cart-tet-page max-w-3xl mx-auto px-4 py-12 relative">
        <div className="cart-tet-card text-center space-y-4">
          <CheckCircle2 className={`w-16 h-16 mx-auto ${qrPaidFailed ? 'text-red-600' : isPrepaidOrder && !qrPaidDone ? 'text-amber-500' : 'text-emerald-600'}`} />
          <h1 className="text-2xl font-bold text-[#1f1712]">
            {isPrepaidOrder
              ? qrPaidDone
                ? 'Thanh toán QR thành công!'
                : qrPaidFailed
                  ? 'Thanh toán thất bại (Quá thời gian 10 phút)'
                  : 'Đơn hàng đang chờ quét mã QR thanh toán'
              : successData.message}
          </h1>
          <p className="text-sm text-stone-600">
            Mã nhóm đơn: <strong>{successData.data?.orderGroupCode}</strong> • Tổng số đơn hàng tách theo Shop:{' '}
            <strong>{successData.data?.orders?.length}</strong>
          </p>
          <div className="text-left space-y-2 bg-amber-50 p-4 rounded-xl border border-amber-300">
            {(successData.data?.orders || []).map((ord) => (
              <div key={ord.OrderID} className="flex items-center justify-between text-sm">
                <span>
                  Đơn <strong>#{ord.OrderID}</strong> — Shop <strong>{ord.shopName}</strong> (
                  {ord.PaymentType === 'Prepaid'
                    ? qrPaidDone
                      ? 'Đã thanh toán QR thành công - Sàn giữ tiền hộ'
                      : qrPaidFailed
                        ? 'Thanh toán thất bại - Đã hủy tự động'
                        : 'Chờ quét mã QR thanh toán (10 phút)'
                    : 'Thanh toán COD'}
                  )
                </span>
                <strong className="text-[#b91c1c]">{formatVND(ord.TotalAmount)}</strong>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {isPrepaidOrder && !qrPaidDone && !qrPaidFailed && (
              <button
                type="button"
                onClick={() => setActiveQrPayment(savedQr)}
                className="px-6 py-2.5 rounded-xl bg-amber-500 text-[#450a0a] font-extrabold text-sm inline-flex items-center gap-1.5 hover:bg-amber-400"
              >
                <QrCode className="w-4 h-4" /> Mở lại mã QR thanh toán
              </button>
            )}
            <Link to="/orders" className="px-6 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">
              Theo dõi hành trình đơn hàng
            </Link>
            <Link to="/shop" className="px-6 py-2.5 rounded-xl border border-amber-400 bg-white text-[#7f1d1d] font-bold text-sm">
              Tiếp tục mua sách
            </Link>
          </div>
        </div>

        {activeQrPayment && (
          <QrPaymentModal
            qrPayment={activeQrPayment}
            orders={successData.data?.orders || []}
            onPaidSuccess={() => setQrPaidDone(true)}
            onPaymentFailed={() => setQrPaidFailed(true)}
            onClose={() => {
              const wasPaid = qrPaidDone;
              setActiveQrPayment(null);
              if (wasPaid) navigate('/orders');
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="cart-tet-page max-w-7xl mx-auto px-4 py-8 relative">
      <div className="mb-6 pb-4 border-b border-[#e7ddd0]">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#9b1c1c]">Thanh toán đa gian hàng</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1f1712] mt-1">
          Giỏ Hàng & Đặt Mua Sách
        </h1>
      </div>

      {groupedByShop.length === 0 ? (
        <div className="cart-tet-card text-center py-14 relative z-10">
          <p className="text-lg font-bold text-[#7f1d1d]">Giỏ hàng mùa Xuân của bạn đang trống</p>
          <Link to="/shop" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">
            Đi chọn sách ngay
          </Link>
        </div>
      ) : (
        <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
          {/* Cột trái: Danh sách sách gom theo từng Gian hàng */}
          <div className="lg:col-span-7 space-y-4">
            {groupedByShop.map((group) => {
              const allSelected = group.items.every((i) => i.selected !== false);
              const shopVouchers = vouchers.filter((v) => v.Scope === 'Shop' && v.ShopID === group.shopId);

              return (
                <div key={group.shopId} className="cart-shop-group">
                  <div className="cart-shop-header">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleSelectShop(group.shopId)}
                        className="accent-[#b91c1c] w-4 h-4"
                      />
                      <Store className="w-4 h-4 text-[#b91c1c]" />
                      <Link to={`/shops/${group.shopId}`} className="font-bold text-sm text-[#7f1d1d] hover:underline">
                        {group.shopName}
                      </Link>
                    </label>
                    <span className="text-[11px] text-amber-800 font-semibold">Tách đơn riêng cho Shop này</span>
                  </div>

                  <div className="divide-y divide-amber-100">
                    {group.items.map((item) => (
                      <div key={item.bookId} className="p-4 flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.selected !== false}
                          onChange={() => toggleSelectItem(item.bookId)}
                          className="accent-[#b91c1c] w-4 h-4 shrink-0"
                        />
                        <img
                          src={item.coverImage || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=200&q=80'}
                          alt={item.title}
                          className="w-14 h-20 rounded-lg object-cover border border-amber-200 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <Link to={`/books/${item.bookId}`} className="font-bold text-sm text-[#3b1510] hover:text-[#b91c1c] line-clamp-1">
                            {item.title}
                          </Link>
                          <p className="text-xs text-stone-500">{item.bookCondition}</p>
                          <p className="text-sm font-extrabold text-[#b91c1c] mt-1">{formatVND(item.unitPrice)}</p>
                        </div>

                        <div className="flex items-center border border-amber-300 rounded-lg overflow-hidden bg-white">
                          <button type="button" onClick={() => updateQuantity(item.bookId, item.quantity - 1)} className="px-2.5 py-1 text-sm font-bold hover:bg-amber-50">-</button>
                          <span className="px-2.5 text-xs font-bold">{item.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(item.bookId, item.quantity + 1)} className="px-2.5 py-1 text-sm font-bold hover:bg-amber-50">+</button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.bookId)}
                          className="p-2 text-stone-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Mã Voucher riêng của Shop */}
                  <div className="px-4 py-3 bg-amber-50/70 border-t border-amber-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#7f1d1d] inline-flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" /> Voucher của Shop:
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={shopVoucherCodes[group.shopId] || ''}
                        onChange={(e) => setShopVoucherCodes((prev) => ({ ...prev, [group.shopId]: e.target.value }))}
                        placeholder={shopVouchers[0] ? `Gợi ý: ${shopVouchers[0].Code}` : 'Nhập mã shop...'}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs uppercase bg-white w-40"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cột phải: Địa chỉ, Vận chuyển, Thanh toán trước / COD & Tổng tiền */}
          <div className="lg:col-span-5 space-y-4">
            <div className="cart-tet-card space-y-4">
              <h2 className="text-lg font-bold text-[#1f1712] border-b border-[#efe7dc] pb-2">
                Thông tin nhận hàng
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Địa chỉ giao hàng *</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành..."
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Số điện thoại nhận hàng *</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09xxxxxxxx"
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">Ghi chú cho Shop / Tài xế</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: Giao giờ hành chính, bọc chống sốc kỹ..."
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm"
                  />
                </div>
              </div>

              {/* Phương thức vận chuyển */}
              <div className="pt-2">
                <p className="text-xs font-bold text-[#7f1d1d] mb-2 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> Đơn vị vận chuyển (Quản lý cập nhật hành trình)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'Economy', label: 'Tiết kiệm', sub: '3-5 ngày' },
                    { key: 'Standard', label: 'Nhanh', sub: '1-3 ngày' },
                    { key: 'Express', label: 'Hỏa tốc', sub: 'Trong ngày' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setShippingMethod(m.key)}
                      className={`p-2 rounded-xl border text-left transition ${
                        shippingMethod === m.key
                          ? 'border-[#b91c1c] bg-red-50'
                          : 'border-amber-200 bg-white'
                      }`}
                    >
                      <p className="text-xs font-bold text-[#7f1d1d]">{m.label}</p>
                      <p className="text-[10px] text-stone-500">{m.sub}</p>
                      <p className="text-xs font-extrabold text-amber-800 mt-0.5">{formatVND(shippingFees[m.key])}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* CHỌN THANH TOÁN: COD HOẶC THANH TOÁN TRƯỚC */}
              <div className="pt-2">
                <p className="text-xs font-bold text-[#7f1d1d] mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" /> Hình thức thanh toán
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentType('COD');
                      setPaymentMethod('COD');
                    }}
                    className={`p-3 rounded-xl border text-left ${
                      paymentType === 'COD' ? 'border-[#b91c1c] bg-red-50' : 'border-amber-200 bg-white'
                    }`}
                  >
                    <Banknote className="w-5 h-5 text-[#b91c1c] mb-1" />
                    <p className="text-xs font-extrabold text-[#3b1510]">Nhận hàng mới trả (COD)</p>
                    <p className="text-[10px] text-stone-500">Trả tiền mặt khi nhận sách</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentType('Prepaid');
                      setPaymentMethod('VIETQR');
                    }}
                    className={`p-3 rounded-xl border text-left ${
                      paymentType === 'Prepaid' ? 'border-[#b91c1c] bg-red-50' : 'border-amber-200 bg-white'
                    }`}
                  >
                    <QrCode className="w-5 h-5 text-amber-600 mb-1" />
                    <p className="text-xs font-extrabold text-[#3b1510]">Thanh toán trước</p>
                    <p className="text-[10px] text-stone-500">Sàn giữ tiền hộ (Escrow)</p>
                  </button>
                </div>

                {paymentType === 'Prepaid' && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                    <p className="text-xs font-bold text-[#7f1d1d]">Chọn kênh thanh toán trước:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { id: 'VIETQR', label: 'VietQR Ngân hàng' },
                        { id: 'MOMO', label: 'Ví điện tử MoMo' },
                        { id: 'ZALOPAY', label: 'Ví ZaloPay' },
                        { id: 'AGRIBANK', label: 'Agribank Online' },
                      ].map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setPaymentMethod(ch.id)}
                          className={`py-2 px-2.5 rounded-lg font-bold border ${
                            paymentMethod === ch.id
                              ? 'bg-[#b91c1c] text-amber-100 border-[#b91c1c]'
                              : 'bg-white text-stone-700 border-amber-300'
                          }`}
                        >
                          {ch.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-emerald-800 flex items-center gap-1 pt-1">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      Tiền sẽ được Sàn VitaBook giữ an toàn và chỉ giải ngân cho Shop sau khi bạn xác nhận đã nhận sách!
                    </p>
                  </div>
                )}
              </div>

              {/* Voucher Sàn / Freeship */}
              <div className="pt-2">
                <label className="text-xs font-bold text-[#1f1712] block mb-1">Mã Voucher Sàn / Freeship</label>
                <input
                  type="text"
                  value={platformVoucherCode}
                  onChange={(e) => setPlatformVoucherCode(e.target.value)}
                  placeholder="Nhập mã: TET2027 hoặc FREESHIPTET"
                  className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs uppercase bg-white"
                />
              </div>

              {/* Tổng kết */}
              <div className="border-t border-amber-200 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-stone-600">
                  <span>Tạm tính ({selectedItems.length} sản phẩm / {selectedShopGroups.length} Shop):</span>
                  <strong>{formatVND(cartSubtotal)}</strong>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Phí vận chuyển ({selectedShopGroups.length} đơn):</span>
                  <strong>{formatVND(totalShipping)}</strong>
                </div>
                {estimatedDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Giảm giá Voucher (ước tính):</span>
                    <strong>-{formatVND(estimatedDiscount)}</strong>
                  </div>
                )}
                <div className="flex justify-between text-lg font-extrabold text-[#b91c1c] pt-2 border-t border-amber-200">
                  <span>Tổng thanh toán:</span>
                  <span>{formatVND(grandTotal)}</span>
                </div>
              </div>

              {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-xl">{error}</p>}

              <button
                type="submit"
                disabled={submitting || selectedItems.length === 0}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-amber-100 font-extrabold text-sm border-2 border-amber-400 hover:brightness-110 disabled:opacity-50"
              >
                {submitting
                  ? 'Đang xử lý đơn hàng...'
                  : paymentType === 'Prepaid'
                    ? `Xác nhận Thanh Toán Trước (${formatVND(grandTotal)})`
                    : `Đặt Hàng Thanh Toán Khi Nhận (${formatVND(grandTotal)})`}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default CartCheckoutPage;
