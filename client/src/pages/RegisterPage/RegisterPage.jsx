import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, ArrowLeft, BookOpen, Sparkles, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import TetCaptcha from '../../components/TetCaptcha/TetCaptcha';
import TetFireworksEffect from '../../effects/TetFireworksEffect';
import TetAuthSceneEffect from '../../effects/TetAuthSceneEffect';
import './RegisterPage.css';

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '', address: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchServerCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaError('');
    setCaptchaInput('');
    try {
      const res = await authService.getCaptcha();
      if (res.data?.success) {
        setCaptchaCode(res.data.data.code);
        setCaptchaToken(res.data.data.captchaToken);
      }
    } catch {
      setCaptchaCode('');
      setCaptchaToken('');
      setCaptchaError('Không thể tải mã CAPTCHA từ máy chủ. Vui lòng nhấn Đổi mã.');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServerCaptcha();
  }, [fetchServerCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCaptchaError('');

    if (!captchaToken || !captchaInput.trim()) {
      setCaptchaError('Vui lòng nhập mã xác nhận CAPTCHA.');
      return;
    }

    setLoading(true);
    try {
      await register({
        ...form,
        captchaToken,
        captchaInput: captchaInput.trim(),
      });
      navigate('/');
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 'INVALID_CAPTCHA') {
        setCaptchaError(errData.message || 'Mã xác nhận CAPTCHA chưa chính xác.');
      } else {
        setError(errData?.message || 'Đăng ký thất bại.');
      }
      fetchServerCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-tet-page">
      {/* Hiệu ứng Tết chuyên biệt cho trang Đăng ký: Khung cảnh Xuân + Pháo hoa Giao thừa */}
      <TetAuthSceneEffect />
      <TetFireworksEffect />

      <div className="register-tet-card relative z-10">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="register-back-home">
            <ArrowLeft className="w-3.5 h-3.5" /> Về trang chủ
          </Link>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-200">
            <BookOpen className="w-3.5 h-3.5 text-amber-300" /> VitaBook Xuân
          </span>
        </div>

        <div className="text-center mb-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#e6c67c] font-semibold">
            Xuân Đinh Mùi 2027 • Khai Xuân Tri Thức
          </p>
          <h1 className="text-3xl font-bold text-[#fff8eb] mt-2">Đăng Ký Thành Viên</h1>
          <p className="text-xs text-[#f5ead6]/75 mt-1">
            Tạo tài khoản để mua sách, theo dõi hiệu sách yêu thích và mở Gian hàng bán sách
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/75 border border-red-400 text-red-100 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-amber-200 block mb-1">Họ và tên *</label>
            <input type="text" required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className="register-tet-input" />
          </div>
          <div>
            <label className="text-xs font-bold text-amber-200 block mb-1">Email *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="register-tet-input" />
          </div>
          <div>
            <label className="text-xs font-bold text-amber-200 block mb-1">Mật khẩu (từ 6 ký tự trở lên) *</label>
            <div className="register-password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="register-tet-input register-tet-input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="register-password-toggle"
                title={showPassword ? 'Ẩn mật khẩu' : 'Xem mật khẩu'}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Xem mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-amber-200 block mb-1">Số điện thoại</label>
              <input type="text" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="register-tet-input" />
            </div>
            <div>
              <label className="text-xs font-bold text-amber-200 block mb-1">Địa chỉ</label>
              <input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="register-tet-input" />
            </div>
          </div>

          {/* Mã xác nhận CAPTCHA xác thực phía Server (dùng 1 lần) */}
          <TetCaptcha
            code={captchaCode}
            value={captchaInput}
            onChange={setCaptchaInput}
            onRefresh={fetchServerCaptcha}
            error={captchaError}
            loading={captchaLoading}
          />

          <button type="submit" disabled={loading || captchaLoading} className="register-tet-submit mt-2">
            <UserPlus className="w-4 h-4" />
            {loading ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
          </button>
        </form>

        <p className="text-center text-xs text-amber-100/85 mt-5">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-amber-300 font-bold hover:underline">
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
