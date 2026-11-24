import React, { useState } from 'react';
import { KeyRound, X, Eye, EyeOff, CheckCircle2, Mail } from 'lucide-react';
import { authService } from '../../services/api';
import './ForgotPasswordModal.css';

const ForgotPasswordModal = ({ initialEmail = '', onClose }) => {
  const [step, setStep] = useState(1); // 1: Nhập email lấy OTP | 2: Nhập OTP & mật khẩu mới
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      setDevOtpHint(res.data?.data?.devOtp || '');
      setSuccessMsg(res.data?.message || 'Mã OTP 6 số đã được gửi.');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tạo mã OTP. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có từ 6 ký tự trở lên.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      const res = await authService.resetPassword({
        email: email.trim(),
        otp: otp.trim(),
        newPassword,
      });
      setSuccessMsg(res.data?.message || 'Đặt lại mật khẩu thành công!');
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đặt lại mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tet-modal-overlay" onClick={onClose}>
      <div className="tet-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="tet-modal-header">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-300" />
            <h2 className="text-lg font-extrabold text-[#fef3c7]">Khôi Phục Mật Khẩu</h2>
          </div>
          <button type="button" onClick={onClose} className="tet-modal-close" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <div className="tet-modal-alert tet-modal-alert-error">{error}</div>}
        {successMsg && <div className="tet-modal-alert tet-modal-alert-success">{successMsg}</div>}

        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="space-y-3.5">
            <p className="text-xs text-amber-100/85">
              Nhập Email đã đăng ký để nhận mã OTP 6 số (có hiệu lực trong 10 phút).
            </p>
            <div>
              <label className="text-xs font-bold text-amber-200 block mb-1">Email tài khoản *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@bookstore.vn"
                className="tet-modal-input"
              />
            </div>
            <button type="submit" disabled={loading} className="tet-modal-submit">
              <Mail className="w-4 h-4" />
              {loading ? 'Đang tạo mã OTP...' : 'Nhận mã OTP 6 số'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleResetPassword} className="space-y-3">
            {devOtpHint && (
              <div className="tet-modal-dev-otp">
                <span>Mã OTP (chế độ phát triển cục bộ):</span>
                <strong>{devOtpHint}</strong>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-amber-200 block mb-1">Mã OTP 6 số *</label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Nhập 6 chữ số..."
                className="tet-modal-input tracking-widest font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-amber-200 block mb-1">Mật khẩu mới (từ 6 ký tự trở lên) *</label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="tet-modal-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass((p) => !p)}
                  className="tet-modal-eye"
                  aria-label={showNewPass ? 'Ẩn mật khẩu' : 'Xem mật khẩu'}
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-amber-200 block mb-1">Xác nhận mật khẩu mới *</label>
              <input
                type={showNewPass ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
                className="tet-modal-input"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError('');
                }}
                className="tet-modal-secondary"
              >
                Quay lại
              </button>
              <button type="submit" disabled={loading} className="tet-modal-submit flex-1">
                {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="text-center py-4 space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto" />
            <p className="text-sm text-amber-100">
              Mật khẩu đã được cập nhật và toàn bộ phiên đăng nhập cũ đã được thu hồi an toàn.
            </p>
            <button type="button" onClick={onClose} className="tet-modal-submit">
              Quay lại Đăng nhập
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
