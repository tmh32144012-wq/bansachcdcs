import React, { useEffect, useMemo, useState } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Wifi,
  X,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { generateQrMatrix } from '../../utils/qrCodeGenerator';
import { orderService, formatVND } from '../../services/api';
import { useRealtime } from '../../context/RealtimeContext';
import './QrPaymentModal.css';

const CHANNEL_LABELS = {
  VIETQR: 'VietQR Ngân hàng',
  MOMO: 'Ví điện tử MoMo',
  ZALOPAY: 'Ví ZaloPay',
  AGRIBANK: 'Agribank Online',
};

const QrPaymentModal = ({ qrPayment, orders = [], onPaidSuccess, onPaymentFailed, onClose }) => {
  const { latestQrPaymentEvent } = useRealtime();

  const [status, setStatus] = useState(qrPayment?.status || 'Pending');
  const [paidAt, setPaidAt] = useState(null);
  const [remainingSec, setRemainingSec] = useState(() => {
    const diff = Math.floor((new Date(qrPayment?.expiresAt || Date.now() + 600000) - Date.now()) / 1000);
    return Math.max(0, diff);
  });
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');

  // Render ma trận QR chuẩn ISO ngay trong trình duyệt (quét bằng camera điện thoại)
  const qrData = useMemo(() => {
    if (!qrPayment?.scanUrl) return null;
    try {
      return generateQrMatrix(qrPayment.scanUrl);
    } catch {
      return null;
    }
  }, [qrPayment?.scanUrl]);

  // Đếm ngược thời hạn 10 phút của mã QR; hết giờ lập tức chốt trạng thái thất bại trên server
  useEffect(() => {
    if (status !== 'Pending') return undefined;
    const timer = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          setStatus('Expired');
          if (qrPayment?.paymentToken) {
            orderService.getQrPaymentStatus(qrPayment.paymentToken).catch(() => {});
          }
          if (onPaymentFailed) onPaymentFailed();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status, qrPayment?.paymentToken, onPaymentFailed]);

  // Lắng nghe sự kiện SSE tức thời (quét thành công hoặc hết hạn 10 phút thất bại)
  useEffect(() => {
    if (!latestQrPaymentEvent || !qrPayment?.paymentToken) return;
    if (latestQrPaymentEvent.paymentToken !== qrPayment.paymentToken) return;

    if (latestQrPaymentEvent.status === 'Paid') {
      setStatus('Paid');
      setPaidAt(latestQrPaymentEvent.paidAt || new Date().toISOString());
      if (onPaidSuccess) onPaidSuccess(latestQrPaymentEvent);
    } else if (latestQrPaymentEvent.status === 'Expired' || latestQrPaymentEvent.status === 'Cancelled') {
      setStatus(latestQrPaymentEvent.status);
      if (onPaymentFailed) onPaymentFailed(latestQrPaymentEvent);
    }
  }, [latestQrPaymentEvent, qrPayment?.paymentToken, onPaidSuccess, onPaymentFailed]);

  // Polling dự phòng mỗi 2.5 giây phòng trường hợp SSE tạm ngắt
  useEffect(() => {
    if (status !== 'Pending' || !qrPayment?.paymentToken) return undefined;
    let active = true;

    const checkStatus = async () => {
      try {
        const res = await orderService.getQrPaymentStatus(qrPayment.paymentToken);
        const data = res.data?.data;
        if (!active || !data) return;
        if (data.status === 'Paid') {
          setStatus('Paid');
          setPaidAt(data.paidAt || new Date().toISOString());
          if (onPaidSuccess) onPaidSuccess(data);
        } else if (data.status === 'Expired' || data.status === 'Cancelled') {
          setStatus(data.status);
          if (onPaymentFailed) onPaymentFailed(data);
        }
      } catch (_) {}
    };

    const interval = setInterval(checkStatus, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [status, qrPayment?.paymentToken, onPaidSuccess, onPaymentFailed]);

  const handleSimulateScan = async () => {
    if (!qrPayment?.paymentToken) return;
    setError('');
    setSimulating(true);
    try {
      const res = await orderService.simulateQrPayment(qrPayment.paymentToken);
      const data = res.data?.data;
      setStatus('Paid');
      setPaidAt(data?.paidAt || new Date().toISOString());
      if (onPaidSuccess) onPaidSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể xác nhận thanh toán.');
    } finally {
      setSimulating(false);
    }
  };

  const mins = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const secs = String(remainingSec % 60).padStart(2, '0');
  const quietZone = 4;

  return (
    <div className="qr-modal-overlay">
      <div className="qr-modal-card">
        <div className="qr-modal-header">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#fef3c7]">
                Thanh Toán Trước Bằng Mã QR
              </h2>
              <p className="text-[11px] text-amber-200/85">
                {CHANNEL_LABELS[qrPayment?.paymentMethod] || qrPayment?.paymentMethod} • Mã nhóm: {qrPayment?.orderGroupCode}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="qr-modal-close" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="qr-modal-body">
          {status === 'Paid' ? (
            <div className="text-center py-4 space-y-4">
              <div className="qr-success-badge">
                <CheckCircle2 className="w-14 h-14 text-emerald-600" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                  <Sparkles className="w-3.5 h-3.5" /> Đã quét mã thành công
                </span>
                <h3 className="text-2xl font-extrabold text-emerald-800 mt-2">
                  Thanh Toán Thành Công!
                </h3>
                <p className="text-sm text-stone-600 mt-1">
                  Hệ thống đã xác nhận thanh toán <strong>{formatVND(qrPayment?.totalAmount)}</strong> và giữ tiền hộ an toàn (Escrow) cho tới khi bạn nhận đủ sách.
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-stone-600">Mã giao dịch:</span>
                  <strong>{qrPayment?.orderGroupCode}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Kênh thanh toán:</span>
                  <strong>{CHANNEL_LABELS[qrPayment?.paymentMethod] || qrPayment?.paymentMethod}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Số tiền đã thanh toán:</span>
                  <strong className="text-[#b91c1c]">{formatVND(qrPayment?.totalAmount)}</strong>
                </div>
                {paidAt && (
                  <div className="flex justify-between">
                    <span className="text-stone-600">Thời gian xác nhận:</span>
                    <strong>{new Date(paidAt).toLocaleString('vi-VN')}</strong>
                  </div>
                )}
              </div>

              {orders.length > 0 && (
                <div className="text-left space-y-1.5 bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs">
                  {orders.map((ord) => (
                    <div key={ord.OrderID} className="flex justify-between">
                      <span>
                        Đơn <strong>#{ord.OrderID}</strong> — {ord.shopName || ord.ShopName}
                      </span>
                      <strong className="text-[#b91c1c]">{formatVND(ord.TotalAmount)}</strong>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" onClick={onClose} className="qr-primary-btn">
                Xem hành trình đơn hàng ngay
              </button>
            </div>
          ) : status === 'Expired' || status === 'Cancelled' ? (
            <div className="text-center py-4 space-y-4">
              <div className="qr-fail-badge">
                <XCircle className="w-14 h-14 text-red-600" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-extrabold">
                  <Clock className="w-3.5 h-3.5" /> Quá thời gian 10 phút
                </span>
                <h3 className="text-2xl font-extrabold text-red-800 mt-2">
                  Thanh Toán Thất Bại!
                </h3>
                <p className="text-sm text-stone-600 mt-1">
                  Mã QR thanh toán <strong>{formatVND(qrPayment?.totalAmount)}</strong> đã hết hạn sau 10 phút mà hệ thống chưa nhận được xác nhận quét mã.
                  Đơn hàng đã tự động hủy và hoàn lại tồn kho sách.
                </p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-stone-600">Mã giao dịch:</span>
                  <strong>{qrPayment?.orderGroupCode}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Trạng thái:</span>
                  <strong className="text-red-700">Thanh toán thất bại (Đã hủy tự động)</strong>
                </div>
              </div>
              <button type="button" onClick={onClose} className="qr-primary-btn">
                Đóng & Kiểm tra đơn hàng
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Số tiền & đồng hồ đếm ngược */}
              <div className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                <div>
                  <span className="text-[11px] font-bold text-stone-500 uppercase">Số tiền thanh toán</span>
                  <p className="text-2xl font-extrabold text-[#b91c1c]">{formatVND(qrPayment?.totalAmount)}</p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-stone-500 inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#b91c1c]" /> Hết hạn sau
                  </span>
                  <p className="text-lg font-extrabold font-mono text-[#7f1d1d]">
                    {status === 'Expired' ? '00:00' : `${mins}:${secs}`}
                  </p>
                </div>
              </div>

              {/* Khung mã QR thật quét bằng điện thoại */}
              <div className="qr-code-stage">
                {qrData ? (
                  <svg
                    viewBox={`0 0 ${qrData.size + quietZone * 2} ${qrData.size + quietZone * 2}`}
                    className="qr-svg"
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label="Mã QR thanh toán VitaBook"
                  >
                    <rect
                      width={qrData.size + quietZone * 2}
                      height={qrData.size + quietZone * 2}
                      fill="#ffffff"
                    />
                    {qrData.matrix.map((row, r) =>
                      row.map((dark, c) =>
                        dark ? (
                          <rect
                            key={`${r}-${c}`}
                            x={c + quietZone}
                            y={r + quietZone}
                            width={1}
                            height={1}
                            fill="#1c1917"
                          />
                        ) : null
                      )
                    )}
                  </svg>
                ) : (
                  <p className="text-xs text-red-700">Không thể khởi tạo hình ảnh mã QR.</p>
                )}

                <div className="qr-live-status">
                  <span className="qr-pulse-dot" />
                  <span>
                    {status === 'Expired'
                      ? 'Mã QR đã hết hạn. Vui lòng tạo lại mã mới trong Đơn hàng.'
                      : 'Đang chờ điện thoại quét mã QR (tự động cập nhật)...'}
                  </span>
                </div>
              </div>

              {/* Hướng dẫn quét bằng điện thoại */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs text-stone-700 space-y-1.5">
                <p className="font-bold text-[#7f1d1d] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#b91c1c]" /> Hướng dẫn quét mã (không tốn tiền thật):
                </p>
                <p>1. Kết nối điện thoại cùng mạng Wi-Fi với máy tính này.</p>
                <p>2. Mở <strong>Camera điện thoại</strong> (hoặc Zalo QR), quét mã phía trên rồi bấm mở đường link hiện ra.</p>
                <p>3. Màn hình máy tính sẽ <strong>tự động chuyển sang Thanh toán thành công</strong> ngay lập tức!</p>
                {qrPayment?.detectedIp && (
                  <p className="text-[11px] text-emerald-800 flex items-center gap-1 pt-0.5">
                    <Wifi className="w-3.5 h-3.5 shrink-0" />
                    Địa chỉ LAN đã tự nhận diện: <code className="font-mono font-bold">{qrPayment.detectedIp}:5000</code>
                  </p>
                )}
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-300 text-xs text-red-700 font-semibold">
                  {error}
                </div>
              )}

              {/* Dự phòng nếu không có điện thoại / Firewall chặn LAN */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200">
                <a
                  href={qrPayment?.localScanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-amber-800 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Mở link quét trên tab mới
                </a>

                <button
                  type="button"
                  disabled={simulating || status === 'Expired'}
                  onClick={handleSimulateScan}
                  className="qr-fallback-btn"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {simulating ? 'Đang xác nhận...' : 'Mô phỏng đã quét mã'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QrPaymentModal;
