import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Sparkles, ArrowLeft, BookOpen, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import TetCaptcha from '../../components/TetCaptcha/TetCaptcha';
import ForgotPasswordModal from '../../components/ForgotPasswordModal/ForgotPasswordModal';
import TetFireworksEffect from '../../effects/TetFireworksEffect';
import TetAuthSceneEffect from '../../effects/TetAuthSceneEffect';
import './LoginPage.css';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);
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
      const u = await login(email, password, captchaToken, captchaInput.trim());
      if (u.role === 'Manager') navigate('/manager');
      else if (u.role === 'Admin') navigate('/admin');
      else navigate(from);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 'INVALID_CAPTCHA') {
        setCaptchaError(errData.message || 'Mã xác nhận CAPTCHA chưa chính xác.');
      } else {
        setError(errData?.message || 'Đăng nhập thất bại.');
      }
      fetchServerCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-tet-page">
      {/* Hiệu ứng Tết chuyên biệt cho trang Đăng nhập: Khung cảnh Xuân + Pháo hoa Giao thừa */}
      <TetAuthSceneEffect />
      <TetFireworksEffect />

      <div className="login-tet-card relative z-10">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="login-back-home">
            <ArrowLeft className="w-3.5 h-3.5" /> Về trang chủ
          </Link>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-200">
            <BookOpen className="w-3.5 h-3.5 text-amber-300" /> VitaBook Xuân
          </span>
        </div>

        <div className="text-center mb-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#e6c67c] font-semibold">
            Xuân Đinh Mùi 2027 • An Khang Thịnh Vượng
          </p>
          <h1 className="text-3xl font-bold text-[#fff8eb] mt-2">Đăng Nhập Sàn Sách</h1>
          <p className="text-xs text-[#f5ead6]/75 mt-1">Nhập thông tin tài khoản để mua sắm và quản lý đơn hàng</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/75 border border-red-400 text-red-100 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-amber-200 block mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@bookstore.vn"
              className="login-tet-input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-amber-200">Mật khẩu</label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-[11px] font-semibold text-amber-300 hover:underline bg-transparent border-none cursor-pointer"
              >
                Quên mật khẩu?
              </button>
            </div>
            <div className="login-password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="login-tet-input login-tet-input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="login-password-toggle"
                title={showPassword ? 'Ẩn mật khẩu' : 'Xem mật khẩu'}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Xem mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
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

          <button type="submit" disabled={loading || captchaLoading} className="login-tet-submit">
            <LogIn className="w-4 h-4" />
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập ngay'}
          </button>
        </form>

        <p className="text-center text-xs text-amber-100/85 mt-5">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-amber-300 font-bold hover:underline">
            Đăng ký thành viên mới
          </Link>
        </p>
      </div>

      {forgotOpen && (
        <ForgotPasswordModal initialEmail={email} onClose={() => setForgotOpen(false)} />
      )}
    </div>
  );
};

export default LoginPage;
