import React, { useState } from 'react';
import { ShieldCheck, KeyRound, LogOut, X, Eye, EyeOff } from 'lucide-react';
import { authService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import './AccountSecurityModal.css';

const AccountSecurityModal = ({ onClose, onLoggedOutAll }) => {
  const { user, updateSessionToken, logoutAll } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có từ 6 ký tự trở lên.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.');
      return;
    }

    setSaving(true);
    try {
      const res = await authService.changePassword({ currentPassword, newPassword });
      if (res.data?.data?.token) {
        updateSessionToken(res.data.data.token);
      }
      setSuccess(res.data?.message || 'Đổi mật khẩu thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Đổi mật khẩu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    setError('');
    setRevoking(true);
    try {
      await logoutAll();
      if (onLoggedOutAll) onLoggedOutAll();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đăng xuất mọi thiết bị.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="sec-modal-overlay" onClick={onClose}>
      <div className="sec-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="sec-modal-header">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-base font-extrabold text-[#fef3c7]">Bảo Mật Tài Khoản</h2>
              <p className="text-[11px] text-amber-200/80">{user?.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="sec-modal-close" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <div className="sec-alert sec-alert-error">{error}</div>}
        {success && <div className="sec-alert sec-alert-success">{success}</div>}

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Đổi mật khẩu
            </span>
            <button
              type="button"
              onClick={() => setShowPass((p) => !p)}
              className="text-[11px] text-amber-200 hover:underline inline-flex items-center gap-1"
            >
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-amber-100 block mb-1">Mật khẩu hiện tại *</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="sec-input"
              placeholder="Nhập mật khẩu hiện tại..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-amber-100 block mb-1">Mật khẩu mới (từ 6 ký tự trở lên) *</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="sec-input"
              placeholder="Nhập mật khẩu mới..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-amber-100 block mb-1">Xác nhận mật khẩu mới *</label>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="sec-input"
              placeholder="Nhập lại mật khẩu mới..."
            />
          </div>

          <button type="submit" disabled={saving} className="sec-btn-primary">
            {saving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
          </button>
        </form>

        <div className="sec-divider" />

        <div className="space-y-2">
          <p className="text-xs text-amber-100/85">
            Nếu nghi ngờ tài khoản bị đăng nhập trên thiết bị lạ, bạn có thể thu hồi toàn bộ phiên JWT ngay lập tức.
          </p>
          <button type="button" onClick={handleLogoutAll} disabled={revoking} className="sec-btn-danger">
            <LogOut className="w-4 h-4" />
            {revoking ? 'Đang thu hồi phiên...' : 'Đăng xuất khỏi mọi thiết bị'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountSecurityModal;
