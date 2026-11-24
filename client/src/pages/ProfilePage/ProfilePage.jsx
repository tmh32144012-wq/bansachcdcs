import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  MapPin,
  Mail,
  Camera,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  Store,
  Package,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService, uploadFilesToServer } from '../../services/api';
import './ProfilePage.css';

const ProfilePage = () => {
  const { user, refreshUser, updateSessionToken, logoutAll } = useAuth();
  const navigate = useNavigate();

  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    avatarUrl: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileNotice, setProfileNotice] = useState({ type: '', text: '' });

  const [pwdForm, setPwdForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [pwdNotice, setPwdNotice] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      setProfileForm({
        fullName: user.fullName || '',
        phone: user.phone || '',
        address: user.address || '',
        avatarUrl: user.avatarUrl || '',
      });
    }
  }, [user]);

  const handleAvatarUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingAvatar(true);
    setProfileNotice({ type: '', text: '' });
    try {
      const urls = await uploadFilesToServer(files);
      if (urls[0]) {
        setProfileForm((prev) => ({ ...prev, avatarUrl: urls[0] }));
        setProfileNotice({ type: 'success', text: 'Đã tải ảnh đại diện lên. Nhấn "Lưu thay đổi" để cập nhật hồ sơ.' });
      }
    } catch (err) {
      setProfileNotice({ type: 'error', text: err.response?.data?.message || 'Không thể tải ảnh đại diện.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice({ type: '', text: '' });
    try {
      const res = await authService.updateProfile(profileForm);
      await refreshUser();
      setProfileNotice({ type: 'success', text: res.data?.message || 'Đã cập nhật hồ sơ thành công.' });
    } catch (err) {
      setProfileNotice({ type: 'error', text: err.response?.data?.message || 'Không thể cập nhật hồ sơ.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdNotice({ type: '', text: '' });

    if (pwdForm.newPassword.length < 6) {
      setPwdNotice({ type: 'error', text: 'Mật khẩu mới phải có từ 6 ký tự trở lên.' });
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdNotice({ type: 'error', text: 'Mật khẩu xác nhận không khớp.' });
      return;
    }

    setSavingPwd(true);
    try {
      const res = await authService.changePassword({
        currentPassword: pwdForm.currentPassword,
        newPassword: pwdForm.newPassword,
      });
      if (res.data?.data?.token) {
        updateSessionToken(res.data.data.token);
      }
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwdNotice({ type: 'success', text: res.data?.message || 'Đổi mật khẩu thành công.' });
    } catch (err) {
      setPwdNotice({ type: 'error', text: err.response?.data?.message || 'Không thể đổi mật khẩu.' });
    } finally {
      setSavingPwd(false);
    }
  };

  const handleLogoutAll = async () => {
    setRevoking(true);
    try {
      await logoutAll();
      navigate('/login');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="profile-page max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6 pb-4 border-b border-[#e7ddd0] flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#9b1c1c]">Tài khoản thành viên</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1f1712] mt-1">Hồ Sơ Cá Nhân & Bảo Mật</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/orders" className="profile-quick-link">
            <Package className="w-4 h-4" /> Đơn hàng của tôi
          </Link>
          <Link to="/seller" className="profile-quick-link">
            <Store className="w-4 h-4" /> Kênh Người Bán
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cột trái: Thông tin hồ sơ */}
        <div className="lg:col-span-7 profile-card">
          <div className="flex items-center gap-4 pb-5 mb-5 border-b border-[#efe7dc]">
            <div className="relative">
              {profileForm.avatarUrl ? (
                <img
                  src={profileForm.avatarUrl}
                  alt={profileForm.fullName}
                  className="w-20 h-20 rounded-full object-cover border-2 border-[#d4b483]"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#f5ede2] border border-[#e2d4c1] flex items-center justify-center text-[#9b1c1c]">
                  <User className="w-9 h-9" />
                </div>
              )}
              <label className="profile-avatar-btn" title="Đổi ảnh đại diện">
                <Camera className="w-3.5 h-3.5" />
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploadingAvatar} />
              </label>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1f1712]">{user?.fullName}</h2>
              <p className="text-xs text-stone-500 flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5" /> {user?.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="profile-role-badge">{user?.role}</span>
                {user?.shop && (
                  <span className="profile-shop-badge">
                    Shop: {user.shop.shopName} ({user.shop.approvalStatus})
                  </span>
                )}
              </div>
            </div>
          </div>

          {profileNotice.text && (
            <div className={`profile-alert ${profileNotice.type === 'error' ? 'is-error' : 'is-success'}`}>
              {profileNotice.text}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="profile-label">Họ và tên</label>
              <input
                type="text"
                required
                value={profileForm.fullName}
                onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                className="profile-input"
              />
            </div>

            <div>
              <label className="profile-label flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-stone-400" /> Số điện thoại mặc định
              </label>
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="09xxxxxxxx"
                className="profile-input"
              />
            </div>

            <div>
              <label className="profile-label flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-stone-400" /> Địa chỉ giao hàng mặc định
              </label>
              <textarea
                rows={3}
                value={profileForm.address}
                onChange={(e) => setProfileForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                className="profile-input"
              />
            </div>

            <button type="submit" disabled={savingProfile || uploadingAvatar} className="profile-btn-primary">
              <Save className="w-4 h-4" />
              {savingProfile ? 'Đang lưu...' : uploadingAvatar ? 'Đang tải ảnh...' : 'Lưu thay đổi hồ sơ'}
            </button>
          </form>
        </div>

        {/* Cột phải: Đổi mật khẩu & Quản lý phiên */}
        <div className="lg:col-span-5 space-y-5">
          <div className="profile-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#1f1712] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#9b1c1c]" /> Đổi mật khẩu
              </h2>
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="text-xs font-semibold text-stone-500 hover:text-[#9b1c1c] inline-flex items-center gap-1"
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPass ? 'Ẩn' : 'Hiện'}
              </button>
            </div>

            {pwdNotice.text && (
              <div className={`profile-alert ${pwdNotice.type === 'error' ? 'is-error' : 'is-success'}`}>
                {pwdNotice.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="profile-label">Mật khẩu hiện tại</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  className="profile-input"
                />
              </div>
              <div>
                <label className="profile-label">Mật khẩu mới (từ 6 ký tự trở lên)</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
                  className="profile-input"
                />
              </div>
              <div>
                <label className="profile-label">Xác nhận mật khẩu mới</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  className="profile-input"
                />
              </div>
              <button type="submit" disabled={savingPwd} className="profile-btn-primary w-full justify-center">
                {savingPwd ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
              </button>
            </form>
          </div>

          <div className="profile-card">
            <h2 className="text-base font-bold text-[#1f1712] flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-[#9b1c1c]" /> Phiên đăng nhập an toàn
            </h2>
            <p className="text-xs text-stone-600 leading-relaxed mb-4">
              Thu hồi lập tức toàn bộ phiên đăng nhập trên trình duyệt và thiết bị khác bằng cơ chế cập nhật TokenVersion.
            </p>
            <button
              type="button"
              onClick={handleLogoutAll}
              disabled={revoking}
              className="profile-btn-outline-danger w-full justify-center"
            >
              <LogOut className="w-4 h-4" />
              {revoking ? 'Đang thu hồi...' : 'Đăng xuất khỏi tất cả thiết bị'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
